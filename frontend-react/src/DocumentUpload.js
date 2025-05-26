import React, { useState } from 'react';
import axios from 'axios';
import './DocumentUpload.css';

function DocumentUpload() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('No file selected');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setFileName(droppedFile.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);

    if (!file) {
      setError('Please select a file.');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(
        'http://localhost:8080/api/documents/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to analyze document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-upload-container">
      <div className="upload-card">
        <h1 className="app-title">Legal Document Analyzer</h1>
        <p className="app-subtitle">Upload your legal documents for entity extraction and summarization</p>
        
        <form className="upload-form" onSubmit={handleSubmit}>
          <div 
            className={`file-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="file-input-wrapper">
              <input
                type="file"
                id="file-upload"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileChange}
                className="file-input"
              />
              <label htmlFor="file-upload" className="file-label">
                <div className="upload-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 13V19H5V13H3V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V13H19ZM13 5V16H11V5H6L12 0L18 5H13Z" fill="#4A6CF7"/>
                  </svg>
                </div>
                <span className="dropzone-text">Drag & drop your file here or <span className="browse-link">browse files</span></span>
                <span className="file-name">{fileName}</span>
                <span className="file-types">Supported formats: PDF, DOC, DOCX, TXT</span>
              </label>
            </div>
          </div>
          
          <button 
            className={`analyze-btn ${loading ? 'loading' : ''}`} 
            type="submit" 
            disabled={loading || !file}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Analyzing...
              </>
            ) : (
              'Upload & Analyze'
            )}
          </button>
        </form>

        {error && (
          <div className="error-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z" fill="#FF4D4F"/>
            </svg>
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="result-card">
          <div className="result-header">
            <h2>Analysis Results</h2>
            <div className="result-badge">Success</div>
          </div>
          
          <div className="result-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 0C4.05 0 0 4.05 0 9C0 13.95 4.05 18 9 18C13.95 18 18 13.95 18 9C18 4.05 13.95 0 9 0ZM9 16.2C5.04 16.2 1.8 12.96 1.8 9C1.8 5.04 5.04 1.8 9 1.8C12.96 1.8 16.2 5.04 16.2 9C16.2 12.96 12.96 16.2 9 16.2Z" fill="#4A6CF7"/>
                <path d="M9.45 4.5H8.1V10.8H9.45V4.5Z" fill="#4A6CF7"/>
                <path d="M9.45 12.6H8.1V13.95H9.45V12.6Z" fill="#4A6CF7"/>
              </svg>
              Entities Found
            </h3>
            <div className="entities-grid">
              {result.entities && result.entities.map((entity, idx) => (
                <div key={idx} className="entity-card">
                  <span className="entity-label">{entity.label}</span>
                  <span className="entity-text">{entity.text}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="result-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.2 0H1.8C0.81 0 0 0.81 0 1.8V16.2C0 17.19 0.81 18 1.8 18H16.2C17.19 18 18 17.19 18 16.2V1.8C18 0.81 17.19 0 16.2 0ZM16.2 16.2H1.8V1.8H16.2V16.2Z" fill="#4A6CF7"/>
                <path d="M4.5 4.5H13.5V6.3H4.5V4.5Z" fill="#4A6CF7"/>
                <path d="M4.5 8.1H13.5V9.9H4.5V8.1Z" fill="#4A6CF7"/>
                <path d="M4.5 11.7H9.9V13.5H4.5V11.7Z" fill="#4A6CF7"/>
              </svg>
              Document Summary
            </h3>
            <div className="summary-box">
              {result.summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;