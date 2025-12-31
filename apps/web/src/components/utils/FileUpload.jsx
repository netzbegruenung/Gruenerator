import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { FaUpload } from 'react-icons/fa';

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
    try {
      console.log('FileUpload - Files:', event.target.files);
      const selectedFile = event?.target?.files?.[0];
      if (selectedFile) {
        console.log('FileUpload - Selected file:', selectedFile);
        handleChange(selectedFile);
      } else {
        console.log('FileUpload - Keine Datei ausgewählt');
      }
    } catch (error) {
      console.error('FileUpload - Fehler beim Datei-Upload:', error);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <span>Laden...</span>;
    }
    
    if (file) {
      const fileName = file.name || 'Datei';
      const displayName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
      return (
        <>
          <FaUpload />
          <span>{displayName}</span>
        </>
      );
    }
    
    if (selectedUnsplashImage) {
      return (
        <>
          <FaUpload />
          <span>Unsplash: {selectedUnsplashImage.photographerName}</span>
        </>
      );
    }

    return (
      <>
        <FaUpload />
        <span>Datei auswählen</span>
      </>
    );
  };

  return (
    <div className={`button-wrapper ${isCompact ? 'compact' : ''}`}>
      <input
        id="fileUpload"
        type="file"
        name="fileUpload"
        onChange={onFileChange}
        accept={Array.isArray(allowedTypes) && allowedTypes.length > 0 ? allowedTypes.join(',') : 'image/*'}
        ref={fileInputRef}
        style={{ display: 'none' }}
      />
      <label 
        htmlFor="fileUpload" 
        className={`file-input-text ${loading ? 'loading' : ''}`}
        onClick={handleClick}
        aria-label={isCompact ? "Datei hochladen" : undefined}
      >
        {renderContent()}
      </label>
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
