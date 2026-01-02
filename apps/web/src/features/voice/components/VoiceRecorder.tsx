import { useEffect } from 'react';
import { FaMicrophone, FaStop, FaRedo } from 'react-icons/fa';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import Spinner from '../../../components/common/Spinner';
import ErrorBoundary from '../../../components/ErrorBoundary';

// Voice Feature CSS - Loaded only when this feature is accessed
import '../styles/VoiceRecorder.css';
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
    retryTranscription
  } = useVoiceRecorder(onTranscriptionComplete);

  // Verarbeite die Aufnahme automatisch, wenn sie gestoppt wurde
  useEffect(() => {
    processRecording();
  }, [isRecording, processRecording]);

  return (
    <ErrorBoundary>
      <div className="voice-recorder">
        {error && (
          <div className="voice-recorder-error">
            {error}
            {hasTranscriptionFailed && (
              <button
                className="voice-recorder-retry-button"
                onClick={retryTranscription}
                aria-label="Transkription wiederholen"
              >
                <FaRedo /> Erneut versuchen
              </button>
            )}
          </div>
        )}

        <div className="voice-recorder-controls">
          {isRecording ? (
            <button
              className="voice-recorder-button stop"
              onClick={stopRecording}
              aria-label="Aufnahme stoppen"
            >
              <FaStop />
            </button>
          ) : (
            <button
              className="voice-recorder-button start"
              onClick={startRecording}
              disabled={isProcessing}
              aria-label="Aufnahme starten"
            >
              <FaMicrophone />
            </button>
          )}
        </div>

        {isRecording && (
          <div className="voice-recorder-animation">
            <p className="voice-recorder-status">Aufnahme läuft...</p>
          </div>
        )}

        {isProcessing && (
          <div className="voice-recorder-processing">
            <div className="voice-recorder-spinner">
              <Spinner size="medium" />
            </div>
            <p className="voice-recorder-status">Transkription wird erstellt...</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default VoiceRecorder;
