import React, { useCallback, useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Document, Page, pdfjs } from 'react-pdf';
import { setCurrentPage } from '../store/pdfSlice';
import './PDFViewer.css';

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

const PDFViewer = () => {
  const dispatch = useDispatch();
  const { url, currentPage, name } = useSelector((state) => state.pdf);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);

  // Calculate container width for responsive PDF rendering
  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector('.pdf-viewer');
      if (container) {
        setWidth(container.clientWidth * 0.9); // 90% of container width
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);
  
  const onDocumentLoadError = useCallback((error) => {
    console.error('Error loading PDF:', error);
    setLoading(false);
  }, []);

  const onPrev = useCallback(() => {
    if (currentPage > 1) dispatch(setCurrentPage(currentPage - 1));
  }, [currentPage, dispatch]);

  const onNext = useCallback(() => {
    if (currentPage < numPages) dispatch(setCurrentPage(currentPage + 1));
  }, [currentPage, numPages, dispatch]);
  
  const zoomIn = useCallback(() => {
    setScale(prevScale => Math.min(prevScale + 0.1, 2.0));
  }, []);
  
  const zoomOut = useCallback(() => {
    setScale(prevScale => Math.max(prevScale - 0.1, 0.5));
  }, []);
  
  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  if (!url) {
    return (
      <div className="pdf-viewer-container placeholder">
        <div className="placeholder-content">
          <div className="placeholder-icon">📄</div>
          <p>Upload a PDF to view it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-container" id="pdf-viewer">
      <div className="toolbar">
        <div className="document-info">
          <span className="document-name" title={name}>
            <span className="document-icon">📄</span>
            {name || 'Document'}
          </span>
        </div>
        <div className="toolbar-controls">
          <div className="zoom-controls">
            <button onClick={zoomOut} title="Zoom out">
              <span>-</span>
            </button>
            <button onClick={resetZoom} title="Reset zoom">
              <span>{Math.round(scale * 100)}%</span>
            </button>
            <button onClick={zoomIn} title="Zoom in">
              <span>+</span>
            </button>
          </div>
          <div className="page-navigation">
            <button onClick={onPrev} disabled={currentPage === 1 || loading}>
              <span>←</span> Prev
            </button>
            <span>Page {currentPage} of {numPages || '?'}</span>
            <button onClick={onNext} disabled={numPages > 0 && currentPage === numPages || loading}>
              Next <span>→</span>
            </button>
          </div>
        </div>
      </div>
      <div className="pdf-viewer">
        <Document 
          file={url} 
          onLoadSuccess={onDocumentLoadSuccess} 
          onLoadError={onDocumentLoadError}
          loading={<div className="document-loading">
            <div className="loading-spinner"></div>
            <p>Loading document...</p>
          </div>}
        >
          <Page 
            pageNumber={currentPage} 
            renderTextLayer={false} 
            scale={scale}
            width={width || undefined}
            loading={<div className="page-loading">
              <div className="loading-spinner"></div>
            </div>}
          />
        </Document>
      </div>
    </div>
  );
};

export default React.memo(PDFViewer);
