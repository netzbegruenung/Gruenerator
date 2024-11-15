import React, { useRef } from 'react';
import PropTypes from 'prop-types';

const FileUpload = ({ handleChange, error, allowedTypes, loading, file }) => {
  const fileInputRef = useRef(null);

  const onFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleChange(selectedFile);
    }
  };

  return (
    <div className="file-upload-container">
      <input
        type="file"
        onChange={onFileSelect}
        accept={allowedTypes.join(',')}
        ref={fileInputRef}
        style={{ display: 'none' }}
        disabled={loading}
      />
      <div className="file-upload-wrapper">
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          disabled={loading}
          className="file-upload-button"
        >
          Datei auswählen
        </button>
        {file && (
          <span className="selected-filename">
            {file.name}
          </span>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

FileUpload.propTypes = {
  handleChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  allowedTypes: PropTypes.arrayOf(PropTypes.string),
  loading: PropTypes.bool,
  file: PropTypes.object
};

export default FileUpload;