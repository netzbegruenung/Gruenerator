import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { FiUpload } from 'react-icons/fi';

const FileUpload = ({ loading, file, handleChange, error, allowedTypes, selectedUnsplashImage }) => {
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

  return (
    <>
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
        <label htmlFor="fileUpload" className="file-input-text" onClick={handleClick}>
          {loading ? 'Laden...' : (
            <>
              <FiUpload size={20} />
              <span>{file ? file.name : 'Datei auswählen'}</span>
            </>
          )}
        </label>
      </div>
      {selectedUnsplashImage && (
        <div className="selected-unsplash-message">
          Unsplash Bild ausgewählt: {selectedUnsplashImage.photographerName}
        </div>
      )}
      {error && <div className="error-message">{error}</div>}
    </>
  );
};

FileUpload.propTypes = {
  loading: PropTypes.bool.isRequired,
  file: PropTypes.object,
  handleChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  allowedTypes: PropTypes.array.isRequired,
  selectedUnsplashImage: PropTypes.object // Hinzufügen dieser Prop
};

export default FileUpload;
