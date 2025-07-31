import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { HiX } from 'react-icons/hi';

const FileUpload = ({ handleChange, error, allowedTypes, loading, file, label = "Datei auswählen" }) => {
  const fileInputRef = useRef(null);

  const onFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleChange(selectedFile);
    }
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation(); // Prevent file input from opening
    handleChange(null);
  };

  return (
    <div className="form-field-wrapper">
      {label && (
        <label className="form-field-label">
          {label}
        </label>
      )}
      <input
        type="file"
        onChange={onFileSelect}
        accept={allowedTypes.join(',')}
        ref={fileInputRef}
        style={{ display: 'none' }}
        disabled={loading}
      />
      <div className="file-upload-input-wrapper">
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          disabled={loading}
          className={`file-upload-button ${file ? 'file-upload-button--with-file' : ''}`}
        >
          {file ? (
            <>
              <span className="file-upload-filename">{file.name}</span>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="file-upload-remove"
                aria-label="Datei entfernen"
                disabled={loading}
              >
                <HiX />
              </button>
            </>
          ) : (
            loading ? 'Laden...' : 'Datei auswählen'
          )}
        </button>
      </div>
      {error && <div className="form-field-error">{error}</div>}
    </div>
  );
};

FileUpload.propTypes = {
  handleChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  allowedTypes: PropTypes.arrayOf(PropTypes.string),
  loading: PropTypes.bool,
  file: PropTypes.object,
  label: PropTypes.string
};

export default FileUpload;