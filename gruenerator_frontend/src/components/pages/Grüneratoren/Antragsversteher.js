import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { FiUpload, FiFile } from 'react-icons/fi';

import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';

import { useDynamicTextSize } from '../../utils/commonFunctions';
import BaseForm from '../../common/BaseForm';
import { BUTTON_LABELS } from '../../utils/constants';

const Antragsversteher = ({ showHeaderFooter = true }) => {
  const [antrag, setAntrag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [truncatedFileName, setTruncatedFileName] = useState('');

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

  const handleFileSelect = useCallback((file) => {
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

  const handleSubmit = useCallback(async () => {
    if (!selectedFile) {
      setError('Bitte wählen Sie zuerst eine Datei aus.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      console.log('Sende Datei-Upload-Anfrage an /api/antragsversteher/upload-pdf');
      const response = await axios.post('/api/antragsversteher/upload-pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Datei-Upload-Antwort erhalten:', response.data);

      if (response.data && response.data.text && response.data.summary) {
        setAntrag(response.data.text);
        setGeneratedContent(response.data.summary);
        setSuccess(true);
        console.log('Antrag und generierter Content erfolgreich gesetzt');
      } else {
        throw new Error('Unerwartete Serverantwort');
      }
    } catch (err) {
      console.error('Fehler beim Datei-Upload:', err);
      setError('Fehler beim Hochladen und Verarbeiten der Datei: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  const handleGeneratePost = useCallback(async () => {
    if (!antrag) {
      setError('Kein Antragstext vorhanden. Bitte lade zuerst eine Datei hoch.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/antragsversteher/analyze', { text: antrag });

      if (response.data && response.data.summary) {
        setGeneratedContent(response.data.summary);
        setSuccess(true);
      } else {
        throw new Error('Unerwartete Serverantwort bei der Analyse');
      }
    } catch (err) {
      console.error('Fehler bei der Analyse:', err);
      setError('Fehler bei der Analyse des Antragstextes: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [antrag]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator Antragscheck"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={generatedContent}
        textSize={textSize}
        submitButtonText={BUTTON_LABELS.SUBMIT}
        onGeneratePost={handleGeneratePost}
        generatedPost=""
      >
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
          <label htmlFor="file-input" className="file-upload-label">
            {selectedFile ? (
              <>
                <FiFile size={24} />
                <span className="file-name">{truncatedFileName}</span>
              </>
            ) : (
              <>
                <FiUpload size={24} className="upload-icon" />
                <span>PDF-Datei hier ablegen oder klicken zum Auswählen</span>
              </>
            )}
          </label>
        </div>
      </BaseForm>
    </div>
  );
};

Antragsversteher.propTypes = {
  showHeaderFooter: PropTypes.bool,
};

export default Antragsversteher;