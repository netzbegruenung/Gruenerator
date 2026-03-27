import { type JSX, useEffect } from 'react';
import { FaMicrophone, FaStop, FaRedo } from 'react-icons/fa';

import Spinner from '../../../components/common/Spinner';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { cn } from '../../../utils/cn';
import useVoiceRecorder from '../hooks/useVoiceRecorder';

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
}

const VoiceRecorder = ({ onTranscriptionComplete }: VoiceRecorderProps): JSX.Element => {
  const {
    isRecording,
    isProcessing,
    error,
    hasTranscriptionFailed,
    startRecording,
    stopRecording,
    processRecording,
    retryTranscription,
  } = useVoiceRecorder(onTranscriptionComplete);

  // Verarbeite die Aufnahme automatisch, wenn sie gestoppt wurde
  useEffect(() => {
    processRecording();
  }, [isRecording, processRecording]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col items-center my-4">
        {error && (
          <div className="text-[#e54d2e] mb-4 text-center p-2 rounded bg-[rgba(229,77,46,0.1)] max-w-[400px]">
            {error}
            {hasTranscriptionFailed && (
              <button
                className="flex items-center justify-center gap-2 mt-2 px-4 py-2 bg-primary-600 text-white border-none rounded cursor-pointer text-sm transition-colors duration-200 hover:bg-primary-700 [&_svg]:size-4"
                onClick={retryTranscription}
                aria-label="Transkription wiederholen"
              >
                <FaRedo /> Erneut versuchen
              </button>
            )}
          </div>
        )}

        <div className="mb-4">
          {isRecording ? (
            <button
              className={cn(
                'size-[60px] max-md:size-14 rounded-full border-none flex items-center justify-center cursor-pointer transition-all duration-200 shadow-md [&_svg]:size-6',
                'bg-[#e54d2e] text-white hover:bg-[#ca3e23]'
              )}
              onClick={stopRecording}
              aria-label="Aufnahme stoppen"
            >
              <FaStop />
            </button>
          ) : (
            <button
              className={cn(
                'size-[60px] max-md:size-14 rounded-full border-none flex items-center justify-center cursor-pointer transition-all duration-200 shadow-md [&_svg]:size-6',
                'bg-primary-600 text-white hover:bg-primary-700',
                isProcessing && 'bg-grey-300 cursor-not-allowed hover:bg-grey-300'
              )}
              onClick={startRecording}
              disabled={isProcessing}
              aria-label="Aufnahme starten"
            >
              <FaMicrophone />
            </button>
          )}
        </div>

        {isRecording && (
          <div className="size-[100px] max-md:max-w-[150px] mb-4">
            <p className="text-sm text-grey-500 my-2">Aufnahme läuft...</p>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center bg-primary-600 rounded-full size-10 mb-2">
              <Spinner size="medium" />
            </div>
            <p className="text-sm text-grey-500 my-2">Transkription wird erstellt...</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default VoiceRecorder;
