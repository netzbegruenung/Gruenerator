import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaTimes } from 'react-icons/fa';
import * as tus from 'tus-js-client';

// Dynamischer TUS Upload Endpoint basierend auf der Umgebung
// const isDevelopment = import.meta.env.MODE === 'development'; // Old check using MODE
const isDevelopment = import.meta.env.VITE_APP_ENV === 'development'; // Use explicit env variable
const TUS_UPLOAD_ENDPOINT = isDevelopment
  ? 'http://localhost:3001/api/subtitler/upload' // Dein lokaler Backend-Port
  : 'https://gruenerator.de/api/subtitler/upload'; // Produktions-URL

// Ensure HTTPS is used for production endpoint
if (!isDevelopment && !TUS_UPLOAD_ENDPOINT.startsWith('https://')) {
  console.error('[VideoUploader] Production upload endpoint must use HTTPS');
  // Potenziell einen Fehler werfen oder einen Fallback setzen
}

console.log(`[VideoUploader] Using Tus Endpoint (VITE_APP_ENV: ${import.meta.env.VITE_APP_ENV || 'not set'}):`, TUS_UPLOAD_ENDPOINT);

const VideoUploader = ({ onUpload, isProcessing = false }) => {
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
        metadata: {
          filename: file.name,
          filetype: file.type
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
          // Ensure the URL uses HTTPS
          const secureUploadUrl = uploadUrl.replace('http://', 'https://');
          const uploadId = secureUploadUrl.split('/').pop();
          
          setIsUploading(false);
          setUploadProgress(100);
          
          const fileWithMetadata = {
            ...file,
            uploadId,
            metadata: file.metadata,
            name: file.name,
            size: file.size,
            type: file.type
          };
          
          console.log('[VideoUploader] Upload complete. Passing file to parent:', fileWithMetadata);
          onUpload(fileWithMetadata);
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
                  {isDragActive ? (
                    <FaUpload className="upload-icon pulsing" />
                  ) : (
                    <FaTimes className="upload-icon" style={{ color: '#dc3545' }} />
                  )}
                </div>
                <div className="upload-text">
                  {/* 
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
                  */}
                  <div className="upload-info" style={{marginTop: '10px', fontSize: '0.9em', color: 'gray'}}>
                    Hinweis: Der Reel Grünerator wird gerade überarbeitet und ist bald wieder verfügbar.
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