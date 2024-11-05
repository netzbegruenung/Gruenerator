import React, { useState, useCallback, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { FiUpload, FiFile, FiX } from 'react-icons/fi';
import ErrorBoundary from '../../ErrorBoundary';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import '../../../assets/styles/pages/antragsversteher.css';  // Neue Import-Zeile hinzufügen
import { useDynamicTextSize } from '../../utils/commonFunctions';
import BaseForm from '../../common/BaseForm';
import { BUTTON_LABELS } from '../../utils/constants';
import { FormContext } from '../../utils/FormContext';

const Antragsversteher = ({ showHeaderFooter = true }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [truncatedFileName, setTruncatedFileName] = useState('');

  const formContext = useContext(FormContext);
  const { value: generatedContent, updateValue: setGeneratedContent } = formContext || {};

  const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);

  const resetSuccess = useCallback(() => {
    setSuccess(false);
  }, []);

  useEffect(() => {
    let timeoutId;
    if (success) {
      timeoutId = setTimeout(resetSuccess, 3000);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [success, resetSuccess]);

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
    console.log('Datei ausgewählt:', file.name);
    setSelectedFile(file);
    setError('');
    setTruncatedFileName(truncateFileName(file.name));
  }, []);

  const truncateFileName = (fileName) => {
    if (fileName.length <= 20) return fileName;
    const extension = fileName.split('.').pop();
    return fileName.substring(0, 17) + '...' + extension;
  };

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
    setTruncatedFileName('');
    setGeneratedContent('');
    setError('');
    setSuccess(false);
  }, [setGeneratedContent]);

  useEffect(() => {
    return () => {
      resetUpload();
    };
  }, [resetUpload]);

  const handleSubmit = useCallback(async () => {
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

      const response = await axios.post('/api/antragsversteher/upload-pdf', formData, {
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
      if (err.code === 'ECONNABORTED') {
        setError('Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.');
      } else if (err.response && err.response.status === 400) {
        setError('Die hochgeladene Datei konnte nicht verarbeitet werden. Bitte stellen Sie sicher, dass es sich um ein gültiges PDF-Dokument handelt.');
      } else if (err.response && err.response.status === 413) {
        setError('Die Datei ist zu groß. Bitte laden Sie eine kleinere Datei hoch.');
      } else {
        setError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
      logErrorToService(err);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, setGeneratedContent]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''} antragsversteher-container ${generatedContent ? 'has-content' : ''}`}>
        <BaseForm
          title={generatedContent ? "Analyse" : "Grünerator Antragscheck"}
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error || undefined}
          generatedContent={generatedContent}
          textSize={textSize}
          submitButtonText={selectedFile ? BUTTON_LABELS.SUBMIT : 'Bitte wählen Sie eine PDF-Datei aus'}
          generatedPost=""
          allowEditing={false}
          onReset={resetUpload}
        >
          <h3>{!generatedContent && "Grünerator Antragscheck"}</h3>
          <p className="explanation-text">
            Lade hier deinen Antrag als PDF-Datei hoch. Der Grünerator analysiert den Text und gibt dir eine Einschätzung aus grüner Perspektive.
          </p>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          <div 
            className={`file-upload-area ${isDragging ? 'dragging' : ''}`}
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
            {selectedFile && (
              <button 
                className="file-reset-button"
                onClick={(e) => {
                  e.preventDefault();
                  resetUpload();
                }}
                aria-label="Datei entfernen"
              >
                <FiX size={16} />
              </button>
            )}
            <label htmlFor="file-input" className="file-upload-label">
              {selectedFile ? (
                <>
                  <FiFile size={24} />
                  <span className="file-name">{truncatedFileName}</span>
                </>
              ) : (
                <>
                  <FiUpload size={24} className="upload-icon" />
                  <span>PDF-Datei hier ablegen oder klicken zum Auswählen (max. 32 MB)</span>
                </>
              )}
            </label>
          </div>
        </BaseForm>
      </div>
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
