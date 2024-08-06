import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { FiUpload } from 'react-icons/fi';

const FileUpload = ({ loading, file, handleChange, error, allowedTypes, selectedUnsplashImage, isCompact }) => {
  const fileInputRef = useRef(null);

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('File input clicked');
    fileInputRef.current.value = ""; // Clear the input value to ensure it always triggers the change event
    fileInputRef.current.click();
  };

  const onFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      handleChange(selectedFile);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <span>Laden...</span>;
    }
    if (isCompact) {
      return <FiUpload size={20} />;
    }
    return (
      <>
        <FiUpload size={20} />
        <span>{file ? file.name : 'Datei auswählen'}</span>
      </>
    );
  };

  return (
    <div className={`file-upload-container ${isCompact ? 'compact' : ''}`}>
      <div className={`file-input-wrapper ${loading ? 'loading' : ''}`}>
        <input
          id="fileUpload"
          type="file"
          name="fileUpload"
          onChange={onFileChange}
          accept={allowedTypes.join(',')}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <label 
          htmlFor="fileUpload" 
          className="file-input-text" 
          onClick={handleClick}
          aria-label={isCompact ? "Datei hochladen" : undefined}
        >
          {renderContent()}
        </label>
      </div>
      {!isCompact && selectedUnsplashImage && (
        <div className="selected-unsplash-message">
          Unsplash Bild ausgewählt: {selectedUnsplashImage.photographerName}
        </div>
      )}
      {!isCompact && error && <div className="error-message">{error}</div>}
    </div>
  );
};

FileUpload.propTypes = {
  loading: PropTypes.bool.isRequired,
  file: PropTypes.object,
  handleChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  allowedTypes: PropTypes.array.isRequired,
  selectedUnsplashImage: PropTypes.object,
  isCompact: PropTypes.bool
};

FileUpload.defaultProps = {
  isCompact: false
};

export default FileUpload;