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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
      <button
        className="absolute right-4 top-[max(16px,env(safe-area-inset-top,16px))] z-10 flex size-11 cursor-pointer items-center justify-center rounded-full border-none bg-black/50 text-white [-webkit-tap-highlight-color:transparent]"
        onClick={onClose}
        aria-label="Kamera schließen"
      >
        <PiX size={28} />
      </button>

      {cameraState === 'loading' && (
        <div className="flex flex-col items-center gap-md text-white">
          <div className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
          <p className="m-0 text-base opacity-80">Kamera wird gestartet...</p>
        </div>
      )}

      {cameraState === 'no-camera' && (
        <div className="flex flex-col items-center gap-md text-white">
          <p className="m-0 text-base opacity-80">
            Kein Kamerazugriff möglich. Bitte erlaube den Zugriff in den Browser-Einstellungen.
          </p>
          <button
            className="cursor-pointer rounded-md border border-white/30 bg-white/15 px-lg py-sm text-[0.9375rem] text-white"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
      )}

      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
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
          className="h-full w-full object-cover"
        />
      </div>

      {cameraState === 'ready' && (
        <div className="absolute bottom-[max(32px,env(safe-area-inset-bottom,32px))] left-0 right-0 z-10 flex justify-center">
          <button
            className="flex size-[72px] cursor-pointer items-center justify-center rounded-full border-4 border-white/50 bg-white text-primary shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-transform duration-150 [-webkit-tap-highlight-color:transparent] active:scale-90"
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
