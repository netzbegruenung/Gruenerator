import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaVideo } from 'react-icons/fa';
const VideoUploader = ({ onUpload, isProcessing = false }) => {
  const getVideoMetadata = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        });
        URL.revokeObjectURL(video.src);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      const file = acceptedFiles[0];
      try {
        const metadata = await getVideoMetadata(file);
        file.metadata = metadata;
        onUpload(file);
      } catch (error) {
        console.error('Fehler beim Auslesen der Video-Metadaten:', error);
        onUpload(file);
      }
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv']
    },
    multiple: false,
    disabled: isProcessing
  });

  return (
    <div className="video-uploader">
      <div className="upload-container">
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''} ${isProcessing ? 'processing' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="upload-content">
            {isProcessing ? (
              <>
                <div className="spinner" />
                <div className="upload-text">
                  <h3>Dein Video wird verarbeitet...</h3>
                  <p>Bitte warte einen Moment</p>
                </div>
              </>
            ) : (
              <>
                <div className="upload-icon-container">
                  {isDragActive ? (
                    <FaUpload className="upload-icon pulsing" />
                  ) : (
                    <FaVideo className="upload-icon" />
                  )}
                </div>
                <div className="upload-text">
                  <h3>
                    {isDragActive
                      ? 'Video hier ablegen'
                      : 'Video hochladen'
                    }
                  </h3>
                  <p>
                    {isDragActive
                      ? 'Loslassen zum Hochladen'
                      : 'Ziehe dein Video hierher oder klicke zum Auswählen'
                    }
                  </p>
                  <div className="upload-formats">
                    Unterstützte Formate: MP4, MOV, AVI, MKV
                  </div>
                  <div className="upload-limit">
                    Maximale Dateigröße: 100MB 
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

VideoUploader.propTypes = {
  onUpload: PropTypes.func.isRequired,
  isProcessing: PropTypes.bool
};

export default VideoUploader; 