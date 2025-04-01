import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaVideo } from 'react-icons/fa';
import * as tus from 'tus-js-client';

// Lese die Basis-URL aus der Vite Umgebungsvariable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'; 
// Stelle sicher, dass die Basis-URL /api enthält und hänge den spezifischen Pfad an
//const TUS_UPLOAD_ENDPOINT = API_BASE_URL.endsWith('/api') 
  //? `${API_BASE_URL}/subtitler/upload` 
  //: `${API_BASE_URL}/api/subtitler/upload`; // Füge /api hinzu, falls es fehlt
const TUS_UPLOAD_ENDPOINT = 'https://gruenerator.de/api/subtitler/upload';

console.log('Using Tus Endpoint:', TUS_UPLOAD_ENDPOINT); // Debugging

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
          const uploadId = uploadUrl.split('/').pop();
          
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
                    Maximale Dateigröße: 500MB 
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