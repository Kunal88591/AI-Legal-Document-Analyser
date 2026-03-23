import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import './DocumentUpload.css';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

const PREBUILT_QUESTIONS = [
  'Is there a penalty?',
  'Can I leave early?',
  'What are my risks?'
];

function DocumentUpload() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('No file selected');
  const [result, setResult] = useState(null);
  const [previousText, setPreviousText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [eli15Text, setEli15Text] = useState('');
  const [eli15Loading, setEli15Loading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('Global');
  const [privateMode, setPrivateMode] = useState(true);

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

  const normalizeResult = (payload) => {
    if (!payload) {
      return null;
    }
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { summary: payload };
      }
    }
    return payload;
  };

  const formatRequestError = (err) => {
    const responseData = err.response?.data;
    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData;
    }

    if (responseData && typeof responseData === 'object') {
      return (
        responseData.message ||
        responseData.error ||
        responseData.detail ||
        JSON.stringify(responseData)
      );
    }

    return err.message || 'Failed to analyze document. Please try again.';
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
    formData.append('jurisdiction', jurisdiction);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/documents/upload`, formData);
      if (result?.text) {
        setPreviousText(result.text);
      }

      const normalized = normalizeResult(response.data);
      setResult(normalized);
      setSelectedQuestion('');
      setSearchTerm('');
      setEli15Text(normalized?.simpleSummary || '');
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSimplify = async () => {
    if (!result?.summary) {
      return;
    }

    setEli15Loading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/documents/simplify`, {
        text: result.summary
      });
      setEli15Text(response.data?.simpleText || result.simpleSummary || 'No simplified summary available.');
    } catch {
      setEli15Text(result.simpleSummary || 'Could not simplify right now.');
    } finally {
      setEli15Loading(false);
    }
  };

  const readSummaryAloud = () => {
    if (!window.speechSynthesis || !result) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      `${result.summaryPoints?.join('. ') || ''}. Overall risk is ${result.riskLevel || 'Unknown'}.`
    );
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const downloadPdfReport = () => {
    if (!result) {
      return;
    }

    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(16);
    doc.text('AI Legal Document Analyzer Report', 14, y);
    y += 10;

    doc.setFontSize(11);
    const summaryLines = [
      `File: ${fileName}`,
      `Jurisdiction: ${result.jurisdiction || jurisdiction}`,
      `Risk Score: ${result.riskScore || 0}% (${result.riskLevel || 'Unknown'})`,
      `Private Mode: ${privateMode ? 'Enabled' : 'Disabled'}`,
      ''
    ];
    doc.text(summaryLines, 14, y);
    y += 28;

    doc.setFontSize(12);
    doc.text('5-Line Summary', 14, y);
    y += 8;

    const points = result.summaryPoints || [];
    points.forEach((point) => {
      const wrapped = doc.splitTextToSize(`- ${point}`, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 6;
    });

    y += 4;
    doc.text('Clause Tags: ' + ((result.clauseTags || []).join(', ') || 'None'), 14, y);
    y += 10;

    doc.text('Highlighted Risks', 14, y);
    y += 8;

    (result.highlights || [])
      .filter((item) => item.severity === 'risky')
      .slice(0, 8)
      .forEach((item) => {
        const wrapped = doc.splitTextToSize(`- [Line ${item.lineNumber}] ${item.text}`, 180);
        doc.text(wrapped, 14, y);
        y += wrapped.length * 6;
      });

    doc.save('legal-analysis-summary.pdf');
  };

  const searchResults = useMemo(() => {
    if (!result?.text || !searchTerm.trim()) {
      return [];
    }

    const lowered = searchTerm.toLowerCase();
    return result.text
      .split(/\r?\n/)
      .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
      .filter((line) => line.text && line.text.toLowerCase().includes(lowered))
      .slice(0, 12);
  }, [result, searchTerm]);

  const comparison = useMemo(() => {
    if (!previousText || !result?.text) {
      return null;
    }

    const oldSet = new Set(previousText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    const newSet = new Set(result.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));

    let added = 0;
    let removed = 0;

    newSet.forEach((line) => {
      if (!oldSet.has(line)) {
        added += 1;
      }
    });

    oldSet.forEach((line) => {
      if (!newSet.has(line)) {
        removed += 1;
      }
    });

    return { added, removed };
  }, [previousText, result]);

  const distribution = result?.clauseDistribution || {};
  const totalClauses = Math.max(
    1,
    (distribution.important || 0) +
      (distribution.warning || 0) +
      (distribution.risky || 0) +
      (distribution.neutral || 0)
  );

  const riskyPercent = Math.round(((distribution.risky || 0) / totalClauses) * 100);
  const warningPercent = Math.round(((distribution.warning || 0) / totalClauses) * 100);
  const importantPercent = Math.round(((distribution.important || 0) / totalClauses) * 100);
  const neutralPercent = 100 - riskyPercent - warningPercent - importantPercent;

  const questionAnswer = result?.qa?.[selectedQuestion];

  const appClassName = `document-upload-container ${darkMode ? 'dark' : ''}`;

  return (
    <div className={appClassName}>
      <div className="upload-card">
        <div className="top-actions">
          <button className="toggle-btn" type="button" onClick={() => setDarkMode((prev) => !prev)}>
            {darkMode ? 'Switch to Light' : 'Switch to Dark'}
          </button>
          <label className="private-mode-toggle">
            <input
              type="checkbox"
              checked={privateMode}
              onChange={(e) => setPrivateMode(e.target.checked)}
            />
            <span>Private Mode (no storage)</span>
          </label>
        </div>

        <h1 className="app-title">Legal Document Analyzer</h1>
        <p className="app-subtitle">Fast legal clarity with smart risks, highlights, and one-click simplification</p>
        
        <form className="upload-form" onSubmit={handleSubmit}>
          <div className="jurisdiction-row">
            <label htmlFor="jurisdiction">Jurisdiction</label>
            <select
              id="jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            >
              <option value="Global">Global</option>
              <option value="India">India</option>
              <option value="USA">USA</option>
              <option value="EU">EU</option>
            </select>
          </div>

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
                accept=".pdf,.docx,.txt"
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
                <span className="file-types">Supported formats: PDF, DOCX, TXT</span>
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

          <div className="summary-card">
            <div className="summary-card-header">
              <h3>Quick 5-Line Summary</h3>
              <div className="summary-actions">
                <button type="button" onClick={downloadPdfReport}>Download PDF</button>
                <button type="button" onClick={readSummaryAloud}>Listen</button>
              </div>
            </div>
            <ul>
              {(result.summaryPoints || []).map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
            {comparison && (
              <p className="comparison-line">
                Version diff vs previous upload: +{comparison.added} lines, -{comparison.removed} lines
              </p>
            )}
          </div>

          <div className="risk-meter-card">
            <h3>Risk Meter</h3>
            <div className="risk-meter-track">
              <div
                className={`risk-meter-fill ${(result.riskLevel || '').toLowerCase()}`}
                style={{ width: `${result.riskScore || 0}%` }}
              />
            </div>
            <p className="risk-caption">
              Risk Level: {(result.riskScore || 0)}% ({result.riskLevel || 'Unknown'})
            </p>
          </div>

          <div className="tags-and-chart-grid">
            <div className="tag-card">
              <h3>Clause Tags</h3>
              <div className="tag-list">
                {(result.clauseTags || []).length ? (
                  result.clauseTags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)
                ) : (
                  <p>No high-risk tags detected.</p>
                )}
              </div>
            </div>

            <div className="pie-card">
              <h3>Clause Distribution</h3>
              <div
                className="pie-visual"
                style={{
                  background: `conic-gradient(#ff4d4f 0 ${riskyPercent}%, #f6b93b ${riskyPercent}% ${riskyPercent + warningPercent}%, #2ecc71 ${riskyPercent + warningPercent}% ${riskyPercent + warningPercent + importantPercent}%, #c9d6df ${riskyPercent + warningPercent + importantPercent}% 100%)`
                }}
              />
              <div className="legend-row">
                <span>Risky {riskyPercent}%</span>
                <span>Warning {warningPercent}%</span>
                <span>Important {importantPercent}%</span>
                <span>Neutral {neutralPercent}%</span>
              </div>
            </div>
          </div>

          <div className="heatmap-card">
            <h3>Risk Heatmap</h3>
            <div className="heatmap-grid">
              {[...Array(10)].map((_, index) => {
                const active = index < Math.ceil((result.riskScore || 0) / 10);
                return <div key={index} className={`heat-cell ${active ? 'active' : ''}`} />;
              })}
            </div>
          </div>

          <div className="result-section">
            <h3 className="section-title">Highlighted Document Viewer</h3>
            <div className="document-viewer">
              {(result.text || '').split(/\r?\n/).map((line, index) => {
                const highlight = (result.highlights || []).find((item) => item.lineNumber === index + 1);
                const lineClass = highlight?.severity || 'neutral';

                return (
                  <div key={`${index}-${line.slice(0, 20)}`} className={`viewer-line ${lineClass}`}>
                    <span className="viewer-line-no">{index + 1}</span>
                    <span className="viewer-line-text">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
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
            <button className="eli15-btn" type="button" onClick={handleSimplify} disabled={eli15Loading}>
              {eli15Loading ? 'Simplifying...' : 'Explain Like I am 15'}
            </button>
            {eli15Text && <div className="eli15-output">{eli15Text}</div>}
          </div>

          <div className="result-section">
            <h3 className="section-title">Highlight Important Lines</h3>
            <div className="highlight-list">
              {(result.highlights || []).slice(0, 20).map((item, idx) => (
                <div key={idx} className={`highlight-item ${item.severity}`}>
                  <span className="line-no">Line {item.lineNumber}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="result-section">
            <h3 className="section-title">Important Dates Timeline</h3>
            <div className="timeline-list">
              {(result.timeline || []).length ? (
                result.timeline.map((event, idx) => (
                  <div key={idx} className="timeline-item">
                    <span>{event.label}</span>
                    <strong>{event.value}</strong>
                  </div>
                ))
              ) : (
                <p>No explicit dates detected.</p>
              )}
            </div>
          </div>

          <div className="result-section">
            <h3 className="section-title">Pre-Built Questions</h3>
            <div className="question-row">
              {PREBUILT_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className={`question-btn ${selectedQuestion === question ? 'active' : ''}`}
                  onClick={() => setSelectedQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
            {questionAnswer && <div className="answer-box">{questionAnswer}</div>}
          </div>

          <div className="result-section">
            <h3 className="section-title">Search Inside Document</h3>
            <input
              className="search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search words like salary, notice, penalty"
            />
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((item, idx) => (
                  <p key={idx}>
                    <strong>Line {item.lineNumber}:</strong> {item.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;