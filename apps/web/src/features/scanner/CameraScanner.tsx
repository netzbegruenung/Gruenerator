import { useState, useRef, useCallback } from 'react';
import { PiCamera, PiX } from 'react-icons/pi';
import Webcam from 'react-webcam';

interface CameraScannerProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

type CameraState = 'loading' | 'ready' | 'no-camera';

const CameraScanner = ({ onCapture, onClose }: CameraScannerProps) => {
  const [cameraState, setCameraState] = useState<CameraState>('loading');
  const webcamRef = useRef<Webcam>(null);

  const handleUserMedia = useCallback(() => {
    setCameraState('ready');
  }, []);

  const handleUserMediaError = useCallback(() => {
    setCameraState('no-camera');
  }, []);

  const handleCapture = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob: Blob | null) => {
        if (blob) {
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
        }
      },
      'image/jpeg',
      0.92
    );
  }, [onCapture]);

  return (
    <div className="scanner-camera-overlay">
      <button className="scanner-camera-close-btn" onClick={onClose} aria-label="Kamera schließen">
        <PiX size={28} />
      </button>

      {cameraState === 'loading' && (
        <div className="scanner-camera-loading">
          <div className="scanner-camera-spinner" />
          <p>Kamera wird gestartet...</p>
        </div>
      )}

      {cameraState === 'no-camera' && (
        <div className="scanner-camera-loading">
          <p>Kein Kamerazugriff möglich. Bitte erlaube den Zugriff in den Browser-Einstellungen.</p>
          <button className="scanner-camera-fallback-btn" onClick={onClose}>
            Schließen
          </button>
        </div>
      )}

      <div className="scanner-camera-viewfinder">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          videoConstraints={{
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
          className="scanner-camera-video"
        />
      </div>

      {cameraState === 'ready' && (
        <div className="scanner-camera-controls">
          <button
            className="scanner-camera-capture-btn"
            onClick={handleCapture}
            aria-label="Foto aufnehmen"
          >
            <PiCamera size={32} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CameraScanner;
