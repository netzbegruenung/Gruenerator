import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaTimes } from 'react-icons/fa';
import * as tus from 'tus-js-client';
import apiClient from '../../../components/utils/apiClient';
import '../styles/subtitler.css';

// Get base URL from apiClient instead of hardcoding
const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/subtitler/upload`;

console.log(`[VideoUploader] Using Tus Endpoint:`, TUS_UPLOAD_ENDPOINT);

const VideoUploader = ({ onUpload, onBack, isProcessing = false }) => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const getVideoMetadata = (file) => {
    return new Promise((resolve) => {
      console.log('[VideoUploader] Getting metadata for file:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const metadata = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        };
        console.log('[VideoUploader] Extracted metadata:', metadata);
        resolve(metadata);
        URL.revokeObjectURL(video.src);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const startTusUpload = async (file) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      console.log('[VideoUploader] Starting upload for file:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      const metadata = await getVideoMetadata(file);
      file.metadata = metadata;

      const upload = new tus.Upload(file, {
        endpoint: TUS_UPLOAD_ENDPOINT,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        onError: (error) => {
          console.error(`[VideoUploader] Upload Fehler zu ${TUS_UPLOAD_ENDPOINT}:`, error);
          setIsUploading(false);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = (bytesUploaded / bytesTotal * 100).toFixed(2);
          setUploadProgress(percentage);
          console.log(`[VideoUploader] Upload progress: ${percentage}%`);
        },
        onSuccess: () => {
          const uploadUrl = upload.url;
          // Ensure the URL uses HTTPS if needed (logic might need adjustment based on actual URLs)
          const secureUploadUrl = uploadUrl.startsWith('http://localhost') ? uploadUrl : uploadUrl.replace('http://', 'https://'); 
          const uploadId = secureUploadUrl.split('/').pop();
          
          setIsUploading(false);
          setUploadProgress(100);
          
          // 'upload.file' enthält das originale File-Objekt, das an new tus.Upload übergeben wurde
          const originalFile = upload.file; 
          
          // Stelle sicher, dass Metadaten vom vorherigen Schritt vorhanden sind
          const metadataFromFile = file.metadata || {}; 

          const uploadData = {
            originalFile: originalFile, // Das wichtige File-Objekt
            uploadId,
            metadata: metadataFromFile, // Verwende die extrahierten Metadaten
            name: originalFile.name,
            size: originalFile.size,
            type: originalFile.type,
          };
          
          console.log('[VideoUploader] Upload complete. Passing data to parent:', uploadData);
          onUpload(uploadData); // Übergibt das Objekt mit originalFile
        }
      });

      upload.start();
    } catch (error) {
      console.error('[VideoUploader] Upload Start Fehler:', error);
      setIsUploading(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      const file = acceptedFiles[0];
      await startTusUpload(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv']
    },
    multiple: false,
    disabled: isProcessing || isUploading
  });

  return (
    <div className="video-uploader">
      <div className="upload-container">
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''} ${isProcessing || isUploading ? 'processing' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="upload-content">
            {isUploading ? (
              <>
                <div className="upload-progress-container">
                  <div className="upload-progress-bar">
                    <div 
                      className="upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="upload-progress-text">
                    {uploadProgress}%
                  </div>
                </div>
                <div className="upload-text">
                  <h3>Upload läuft...</h3>
                  <p>Bitte warte, bis der Upload abgeschlossen ist</p>
                </div>
              </>
            ) : isProcessing ? (
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
                  <FaUpload className={`upload-icon ${isDragActive ? 'pulsing' : ''}`} />
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
                    Maximale Dateigröße: 500MB 
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {onBack && !isUploading && !isProcessing && (
          <button className="btn-secondary" onClick={onBack} style={{ marginTop: 'var(--spacing-medium)' }}>
            Zurück zur Projektauswahl
          </button>
        )}
      </div>
    </div>
  );
};

VideoUploader.propTypes = {
  onUpload: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  isProcessing: PropTypes.bool
};

export default VideoUploader;