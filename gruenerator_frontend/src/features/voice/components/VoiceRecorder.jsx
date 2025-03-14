import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { FaMicrophone, FaStop, FaRedo } from 'react-icons/fa';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import Spinner from '../../../components/common/Spinner';
import ErrorBoundary from '../../../components/ErrorBoundary';
import '../styles/VoiceRecorder.css';
import '../../../assets/styles/components/spinner.css';

const VoiceRecorder = ({ onTranscriptionComplete }) => {
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
            <DotLottieReact
              src="https://lottie.host/98c6e050-b8d2-47a6-80cf-a3aeea335afb/Yy69gKzW3d.lottie"
              loop
              autoplay
            />
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

VoiceRecorder.propTypes = {
  onTranscriptionComplete: PropTypes.func.isRequired,
};

export default VoiceRecorder; 