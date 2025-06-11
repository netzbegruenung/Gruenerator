import React, { useState, useCallback, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { FiUpload, FiFile, FiX, FiFileText, FiCheck } from 'react-icons/fi';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import ErrorBoundary from '../../ErrorBoundary';
// import { useDynamicTextSize } from '../../utils/commonFunctions';
import { FormContext } from '../../utils/FormContext';
import AnimatedCheckbox from '../../common/AnimatedCheckbox';
import Spinner from '../../common/Spinner';
import apiClient from '../../utils/apiClient';

// Simple markdown processing function
const processMarkdown = (text) => {
  if (!text) return '';
  
  return text
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraphs
    .replace(/^(.+)$/, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '')
    // Lists
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Numbers lists
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
};

const Antragsversteher = ({ showHeaderFooter = true }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dataPrivacyAccepted, setDataPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const formContext = useContext(FormContext);
  const { value: generatedContent, updateValue: setGeneratedContent } = formContext || {};
  const shouldReduceMotion = useReducedMotion();

  // const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);

  useEffect(() => {
    const hasAcceptedTerms = localStorage.getItem('termsAccepted');
    if (hasAcceptedTerms) {
      setTermsAccepted(true);
    }
  }, []);

  const validateFile = (file) => {
    const maxSizeMB = 32;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (!file) return 'Bitte wählen Sie eine Datei aus.';
    if (file.type !== 'application/pdf') return 'Bitte wählen Sie eine PDF-Datei aus.';
    if (file.size > maxSizeBytes) {
      return `Die Datei ist zu groß (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximale Größe ist ${maxSizeMB} MB.`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSelectedFile(file);
    setError('');
  }, []);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length) {
      handleFileSelect(files[0]);
    }
  };

  const resetUpload = useCallback(() => {
    setSelectedFile(null);
    setGeneratedContent('');
    setError('');
    setSuccess(false);
  }, [setGeneratedContent]);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    setError('');
    setSuccess(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!dataPrivacyAccepted) {
      setError('Bitte bestätigen Sie die Datenschutzerklärung.');
      return;
    }

    if (!termsAccepted) {
      setError('Bitte stimmen Sie den Nutzungsbedingungen zu.');
      return;
    }

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiClient.post('/antragsversteher/upload-pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000,
      });

      if (response.data && response.data.summary) {
        setGeneratedContent(response.data.summary);
        setSuccess(true);
      } else {
        throw new Error('Unerwartete Serverantwort');
      }
    } catch (err) {
      console.error('Fehler beim Datei-Upload:', err);
      
      // Handle different error types from apiClient
      if (err.name === 'NetworkError') {
        setError('Netzwerkfehler: Bitte prüfen Sie Ihre Internetverbindung.');
      } else if (err.name === 'HttpError') {
        if (err.status === 413) {
          setError('Die Datei ist zu groß. Bitte laden Sie eine kleinere Datei hoch.');
        } else if (err.status === 400) {
          setError('Die hochgeladene Datei konnte nicht verarbeitet werden. Bitte stellen Sie sicher, dass es sich um ein gültiges PDF-Dokument handelt.');
        } else {
          setError(`Serverfehler (${err.status}). Bitte versuchen Sie es später erneut.`);
        }
      } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        setError('Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.');
      } else {
        setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
      
      logErrorToService(err);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, setGeneratedContent, dataPrivacyAccepted, termsAccepted]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isSubmitDisabled = !selectedFile || !dataPrivacyAccepted || !termsAccepted || loading;

  return (
    <ErrorBoundary>
      <motion.div 
        className={`antragsversteher-container ${generatedContent ? 'has-content' : ''}`}
        initial={shouldReduceMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="antragsversteher-form-section">
          <h1 className="antragsversteher-title">
            {generatedContent ? "Weitere Analyse" : "Grünerator Antragscheck"}
          </h1>
          
          <p className="antragsversteher-description">
            Lade hier deinen Antrag als PDF-Datei hoch. Der Grünerator analysiert den Text und gibt dir eine Einschätzung aus grüner Perspektive.
          </p>

          <AnimatePresence>
            {error && (
              <motion.div 
                className="error-message"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div 
            className={`file-upload-playground ${isDragging ? 'dragging' : ''} ${selectedFile ? 'file-selected-state' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              accept="application/pdf"
              style={{ display: 'none' }}
              id="file-input"
            />

            <AnimatePresence>
              {selectedFile && (
                <motion.button 
                  className="file-remove-button"
                  onClick={(e) => {
                    e.preventDefault();
                    removeFile();
                  }}
                  aria-label="Datei entfernen"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  whileHover={shouldReduceMotion ? {} : { scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <FiX size={16} />
                </motion.button>
              )}
            </AnimatePresence>

            <label htmlFor="file-input" className="file-upload-content">
              <AnimatePresence mode="wait">
                {selectedFile ? (
                  <motion.div 
                    className="file-info"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="file-icon">
                      <FiFile />
                    </div>
                    <div className="file-details">
                      <h4 title={selectedFile.name}>{selectedFile.name}</h4>
                      <div className="file-size">{formatFileSize(selectedFile.size)}</div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="upload-icon-container">
                      <FiUpload className="upload-icon" />
                    </div>
                    <div className="upload-text">
                      PDF-Datei hier ablegen oder klicken
                    </div>
                    <div className="upload-subtext">
                      Maximale Größe: 32 MB
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </label>
          </div>

          <div className="checkbox-section">
            <div className="checkbox-item">
              <AnimatedCheckbox
                id="privacy-checkbox"
                checked={dataPrivacyAccepted}
                onChange={(e) => setDataPrivacyAccepted(e.target.checked)}
                label=""
                variant="simple"
              />
              <span className="checkbox-text">
                Ich bestätige, dass ich keine personenbezogenen oder vertraulichen Daten eingebe und bin damit einverstanden, dass die Daten entsprechend der <a href="/datenschutz#nutzungsbedingungen" className="checkbox-link">Nutzungsbedingungen</a> des Grünerators von Anthropic verarbeitet und 28 Tage gespeichert werden.
              </span>
            </div>

            {!termsAccepted && (
              <div className="checkbox-item">
                <AnimatedCheckbox
                  id="terms-checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked) {
                      localStorage.setItem('termsAccepted', 'true');
                    }
                  }}
                  label=""
                  variant="simple"
                />
                <span className="checkbox-text">
                  Ich stimme den{' '}
                  <a href="/datenschutz#nutzungsbedingungen" className="checkbox-link">
                    Nutzungsbedingungen
                  </a>{' '}
                  zu.
                </span>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="submit-section">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className={`custom-submit-button ${loading ? 'loading' : ''} ${success ? 'success' : ''}`}
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="button-content"
                    >
                      <Spinner size="small" white />
                      <span>Analysiere...</span>
                    </motion.div>
                  ) : success ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="button-content"
                    >
                      <FiCheck />
                      <span>Erfolgreich analysiert</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="default"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="button-content"
                    >
                      <FiFileText />
                      <span>PDF analysieren</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {generatedContent && (
            <motion.div 
              className="analysis-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="analysis-header">
                <div className="analysis-icon">
                  <FiFileText />
                </div>
                <h2 className="analysis-title">Analyse-Ergebnis</h2>
              </div>
              
              <div 
                className="analysis-content antrag-text-content"
                style={{ fontSize: '1.2em' }}
                dangerouslySetInnerHTML={{ __html: processMarkdown(generatedContent) }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </ErrorBoundary>
  );
};

Antragsversteher.propTypes = {
  showHeaderFooter: PropTypes.bool,
};

function logErrorToService(error) {
  console.error("Fehler aufgetreten:", error);
}

export default Antragsversteher;
