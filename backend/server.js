const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const http = require('http');
const https = require('https');

const app = express();

// Create both HTTP and HTTPS servers
const httpServer = http.createServer(app);

// For HTTPS, we'll need certificates
// These should be stored securely and loaded from environment variables or a secure config
// For development, you can generate self-signed certificates
let httpsServer;
try {
  // Try to read certificates if they exist
  const privateKey = fs.readFile(path.join(__dirname, 'certs', 'key.pem')).catch(() => null);
  const certificate = fs.readFile(path.join(__dirname, 'certs', 'cert.pem')).catch(() => null);
  
  Promise.all([privateKey, certificate]).then(([key, cert]) => {
    if (key && cert) {
      const credentials = { key, cert };
      httpsServer = https.createServer(credentials, app);
      
      // Start HTTPS server
      const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`HTTPS Server running on port ${HTTPS_PORT}`);
      });
      
      // Set up Socket.IO for HTTPS
      const httpsIo = new Server(httpsServer, {
        cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET', 'POST'] }
      });
      
      // Configure Socket.IO for HTTPS (reuse the same handlers)
      setupSocketHandlers(httpsIo);
    } else {
      console.log('HTTPS certificates not found. Running with HTTP only.');
    }
  }).catch(err => {
    console.error('Error setting up HTTPS:', err);
  });
} catch (error) {
  console.error('Failed to initialize HTTPS server:', error);
}

// Set up Socket.IO for HTTP
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET', 'POST'] }
});

// Ensure uploads directory exists
fs.mkdir(path.join(__dirname, 'uploads'), { recursive: true }).catch(() => {});

// Configure multer for file upload with improved limits
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1,
    fields: 100, // allow some metadata fields
    parts: 100 // generous to avoid LIMIT_PART_COUNT
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Memory management for PDF stores
const pdfStores = new Map(); // pdfId -> { pages: string[], idf: Map, vectors: Map[], name, filePath }
const MAX_INDEXES = 5; // Maximum number of PDF stores to keep in memory

// Function to manage memory usage
const manageMemory = () => {
  if (pdfStores.size > MAX_INDEXES) {
    const oldestKey = Array.from(pdfStores.keys())[0];
    pdfStores.delete(oldestKey);
  }
};

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ------ Simple TF-IDF utilities ------
const tokenize = (text) => {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 1);
};

const buildIndex = (pages) => {
  const df = new Map();
  const pageTermCounts = pages.map((text) => {
    const counts = new Map();
    const tokens = tokenize(text);
    tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    // Update DF
    const seen = new Set();
    for (const t of counts.keys()) {
      if (!seen.has(t)) {
        df.set(t, (df.get(t) || 0) + 1);
        seen.add(t);
      }
    }
    return counts;
  });

  const N = pages.length;
  const idf = new Map();
  for (const [term, dfi] of df.entries()) {
    idf.set(term, Math.log((1 + N) / (1 + dfi)) + 1);
  }

  const vectors = pageTermCounts.map((counts) => {
    const vec = new Map();
    for (const [t, tf] of counts.entries()) {
      const w = (tf / counts.size) * (idf.get(t) || 0);
      if (w) vec.set(t, w);
    }
    return vec;
  });

  return { idf, vectors };
};

const textToVector = (text, idf) => {
  const counts = new Map();
  const tokens = tokenize(text);
  tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  const vec = new Map();
  for (const [t, tf] of counts.entries()) {
    const w = (tf / counts.size) * (idf.get(t) || 0);
    if (w) vec.set(t, w);
  }
  return vec;
};

const cosineSim = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, va] of a.entries()) na += va * va;
  for (const [, vb] of b.entries()) nb += vb * vb;
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, v] of smaller.entries()) {
    const u = larger.get(t);
    if (u) dot += v * u;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// Handle PDF upload with explicit multer error handling
app.post('/api/upload', (req, res) => {
  // Call multer and capture any MulterError here to ensure JSON response
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: err.code, message: err.message });
      }
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload error', message: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate file size
      if (req.file.size > 100 * 1024 * 1024) {
        throw new Error('File size exceeds 100MB limit');
      }

      // Read PDF buffer and convert to Uint8Array for pdfjs
      const pdfBuffer = await fs.readFile(req.file.path);
      const pdfData = new Uint8Array(pdfBuffer);

      // Extract text per page using pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdfDoc = await loadingTask.promise;
      const pages = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent({ normalizeWhitespace: true });
        const text = content.items.map((i) => i.str).join(' ');
        pages.push(text);
      }

      // Build TF-IDF index over pages
      const { idf, vectors } = buildIndex(pages);

      const pdfId = req.file.filename;
      const base = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${base}/uploads/${req.file.filename}`;
      const store = {
        name: req.file.originalname,
        pages,
        idf,
        vectors,
        filePath: fileUrl,
      };
      pdfStores.set(pdfId, store);
      manageMemory();

      res.json({ id: pdfId, name: store.name, url: store.filePath });
    } catch (error) {
      console.error('Error processing PDF:', error);
      res.status(500).json({ 
        error: 'Failed to process PDF',
        details: error.message 
      });
    }
  });
});

// Global error handler for multer and other errors (return JSON instead of HTML)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ error: err.code, message: err.message });
  }
  if (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
  next();
});

// Function to set up Socket.IO handlers for both HTTP and HTTPS servers
function setupSocketHandlers(socketIo) {
  socketIo.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('message', async (data) => {
      try {
        const { text, pdfId } = data;
        const store = pdfStores.get(pdfId);

        if (!store) {
          socket.emit('message', {
            text: 'PDF not found. Please upload a PDF first.',
            isUser: false
          });
          return;
        }

        // Optimize query processing (local TF-IDF retrieval)
        const startTime = Date.now();
        const qVec = textToVector(text, store.idf);
        const sims = store.vectors.map((v, idx) => ({ idx, score: cosineSim(qVec, v) }));
        sims.sort((a, b) => b.score - a.score);
        const top = sims.slice(0, 3).filter(s => s.score > 0.01);

        const citations = top.map((t) => ({ page: t.idx + 1 }));
        const snippets = top.map((t) => {
          const pageText = store.pages[t.idx] || '';
          return `Page ${t.idx + 1}: ` + pageText.slice(0, 500) + (pageText.length > 500 ? '...' : '');
        });

        const responseText = snippets.length
          ? `Here are the most relevant excerpts:\n\n${snippets.join('\n\n')}`
          : 'I could not find relevant content. Try rephrasing your question.';

        const queryTime = Date.now() - startTime;
        console.log(`Query processed in ${queryTime}ms`);

        socket.emit('message', {
          text: responseText,
          isUser: false,
          citations,
          queryTime,
        });
      } catch (error) {
        console.error('Error processing query:', error);
        socket.emit('message', {
          text: 'Error processing your request. Please try again.',
          isUser: false
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });
}

// Set up Socket.IO handlers for HTTP server
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Memory usage optimization enabled (max ${MAX_INDEXES} PDFs in memory)`);
});
