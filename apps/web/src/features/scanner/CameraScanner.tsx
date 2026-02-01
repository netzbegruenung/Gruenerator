import { useState, useRef, useEffect, useCallback } from 'react';
import { PiCamera, PiX } from 'react-icons/pi';
import Webcam from 'react-webcam';

import useOpenCV from './useOpenCV';

interface CameraScannerProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

type CameraState = 'loading-opencv' | 'ready' | 'no-camera';

const CameraScanner = ({ onCapture, onClose }: CameraScannerProps) => {
  const { isLoaded: isOpenCVLoaded, error: opencvError } = useOpenCV();
  const [cameraState, setCameraState] = useState<CameraState>('loading-opencv');
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  console.log(
    `[CameraScanner] Render. cameraState=${cameraState}, isOpenCVLoaded=${isOpenCVLoaded}, opencvError=${opencvError}, scannerRef.current=${!!scannerRef.current}`
  );

  useEffect(() => {
    console.log(`[CameraScanner] OpenCV effect. isOpenCVLoaded=${isOpenCVLoaded}`);
    if (!isOpenCVLoaded) return;

    let cancelled = false;
    // Use /client export — the default export is the Node version (pulls in jsdom, fs, etc.)
    import('jscanify/client')
      .then((jscanifyModule) => {
        if (cancelled) return;
        console.log(
          `[CameraScanner] jscanify module loaded. Has default:`,
          !!jscanifyModule.default,
          `typeof module:`,
          typeof jscanifyModule
        );
        const JscanifyClass = jscanifyModule.default || jscanifyModule;
        scannerRef.current = new JscanifyClass();
        console.log(`[CameraScanner] jscanify instance created. Setting cameraState=ready`);
        setCameraState('ready');
      })
      .catch((e) => {
        console.error(`[CameraScanner] Failed to initialize jscanify:`, e);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpenCVLoaded]);

  const handleUserMedia = useCallback(() => {
    console.log(
      `[CameraScanner] handleUserMedia (webcam stream received). cameraState=${cameraState}, isOpenCVLoaded=${isOpenCVLoaded}`
    );
    if (cameraState === 'loading-opencv' && isOpenCVLoaded) {
      console.log(`[CameraScanner] Webcam ready AND OpenCV loaded. Setting cameraState=ready`);
      setCameraState('ready');
    }
  }, [cameraState, isOpenCVLoaded]);

  const handleUserMediaError = useCallback((err: unknown) => {
    console.error(`[CameraScanner] handleUserMediaError. Camera access denied/failed:`, err);
    setCameraState('no-camera');
  }, []);

  // Edge detection overlay loop
  useEffect(() => {
    if (cameraState !== 'ready' || !scannerRef.current) return;

    let running = true;
    const detectEdges = () => {
      if (!running) return;

      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === 4) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          try {
            const resultCanvas = scannerRef.current.highlightPaper(video, {
              color: '#46962b',
              thickness: 4,
            });
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(resultCanvas, 0, 0);
          } catch {
            // OpenCV processing can fail on some frames — skip silently
          }
        }
      }

      animFrameRef.current = window.setTimeout(() => {
        if (running) requestAnimationFrame(detectEdges);
      }, 100); // ~10fps to save CPU
    };

    requestAnimationFrame(detectEdges);

    return () => {
      running = false;
      clearTimeout(animFrameRef.current);
    };
  }, [cameraState]);

  const handleCapture = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || !scannerRef.current) return;

    try {
      const extractedCanvas = scannerRef.current.extractPaper(
        video,
        video.videoWidth,
        video.videoHeight
      );

      const sourceCanvas =
        extractedCanvas ||
        (() => {
          const fallback = document.createElement('canvas');
          fallback.width = video.videoWidth;
          fallback.height = video.videoHeight;
          const ctx = fallback.getContext('2d');
          ctx?.drawImage(video, 0, 0);
          return fallback;
        })();

      sourceCanvas.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
          }
        },
        'image/jpeg',
        0.92
      );
    } catch {
      // Fallback: capture raw frame without perspective correction
      const fallback = document.createElement('canvas');
      fallback.width = video.videoWidth;
      fallback.height = video.videoHeight;
      const ctx = fallback.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      fallback.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
          }
        },
        'image/jpeg',
        0.92
      );
    }
  }, [onCapture]);

  return (
    <div className="scanner-camera-overlay">
      <button className="scanner-camera-close-btn" onClick={onClose} aria-label="Kamera schließen">
        <PiX size={28} />
      </button>

      {(cameraState === 'loading-opencv' || (!isOpenCVLoaded && !opencvError)) && (
        <div className="scanner-camera-loading">
          <div className="scanner-camera-spinner" />
          <p>Kamera wird vorbereitet...</p>
        </div>
      )}

      {opencvError && (
        <div className="scanner-camera-loading">
          <p>{opencvError}</p>
          <button className="scanner-camera-fallback-btn" onClick={onClose}>
            Schließen
          </button>
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
        <canvas ref={canvasRef} className="scanner-edge-canvas" />
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
