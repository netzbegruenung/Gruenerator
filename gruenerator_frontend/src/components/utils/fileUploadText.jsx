import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FiUpload, FiFile } from 'react-icons/fi';
import useTextFileUpload from '../hooks/useTextFileUpload';

const FileUpload_Text = ({ onFileSelect, allowedTypes, maxSize }) => {
  console.log('FileUpload_Text wird gerendert');

  const {
    file,
    fileName,
    error,
    dragging,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useTextFileUpload(allowedTypes, maxSize);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (file && onFileSelect) {
      console.log('Datei an übergeordnete Komponente weitergegeben:', file.name);
      onFileSelect(file);
    }
  }, [file, onFileSelect]);

  const handleClick = () => {
    console.log('Datei-Auswahl-Dialog geöffnet');
    fileInputRef.current.click();
  };

  console.log('FileUpload_Text wird gerendert mit Zuständen:', {
    fileName,
    error,
    dragging
  });

  return (
    <div
      className={`file-upload-text ${dragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileChange(e.target.files[0])}
        accept={allowedTypes.join(',')}
        style={{ display: 'none' }}
      />
      <div className="upload-area" onClick={handleClick}>
        {file ? (
          <>
            <FiFile size={24} />
            <span>{fileName}</span>
          </>
        ) : (
          <>
            <FiUpload size={24} />
            <span>PDF-Datei hier ablegen oder klicken zum Auswählen</span>
          </>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

FileUpload_Text.propTypes = {
  onFileSelect: PropTypes.func.isRequired,
  allowedTypes: PropTypes.arrayOf(PropTypes.string),
  maxSize: PropTypes.number
};

FileUpload_Text.defaultProps = {
  allowedTypes: ['application/pdf'],
  maxSize: 10 * 1024 * 1024 // 10 MB
};

export default FileUpload_Text;