import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { uploadPDF } from '../store/pdfSlice';
import './PDFUpload.css';
import { useNavigate } from 'react-router-dom';

const PDFUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadError(null);
    } else if (file) {
      setUploadError('Please select a valid PDF file');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a PDF file first');
      return;
    }
  
    setIsUploading(true);
    setUploadError(null);
    
    const formData = new FormData();
    formData.append('pdf', selectedFile);
  
    try {
      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type here; browser sets it automatically
      });
  
      if (!response.ok) {
        // Try to parse error as JSON first
        let errorData;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
          throw new Error(errorData.message || `Upload failed: ${response.status}`);
        } else {
          // Fallback to text if not JSON
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }
      }
  
      const data = await response.json();
      dispatch(uploadPDF(data));
  
      // Redirect to chat page
      navigate('/chat');
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setUploadError(error.message || 'Failed to upload PDF. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };
  

  // Function to handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadError(null);
    } else if (file) {
      setUploadError('Please select a valid PDF file');
    }
  };

  return (
    <div className="upload-container">
      <h2>Chat with your PDF</h2>
      <p>Upload your PDF document and start asking questions about its content</p>
      
      <div className="upload-area">
        <div 
          className={`file-input-container ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="pdf-upload"
          />
          <label htmlFor="pdf-upload" className="file-input-content">
            <div className="file-input-icon">
              {selectedFile ? '📄' : '📁'}
            </div>
            <div className="file-input-text">
              {selectedFile ? 'PDF Selected' : 'Drag & Drop your PDF here'}
            </div>
            <div className="file-input-subtext">
              {selectedFile ? 'Click to change file' : 'or click to browse files'}
            </div>
            
            {selectedFile && (
              <div className="selected-file">
                <span>📄</span>
                <span>{selectedFile.name}</span>
              </div>
            )}
          </label>
        </div>
        
        {uploadError && (
          <div className="upload-error">
            <span>⚠️</span> {uploadError}
          </div>
        )}
        
        <button 
          onClick={handleUpload} 
          disabled={!selectedFile || isUploading} 
          className="upload-button"
        >
          {isUploading ? 'Uploading...' : 'Upload and Start Chat'}
          {!isUploading && <span>→</span>}
        </button>
      </div>
    </div>
  );
};

export default PDFUpload;
