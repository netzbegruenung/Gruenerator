import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FaMicrophone, FaStop, FaRedo } from 'react-icons/fa';
import Spinner from '../Spinner';
import useVoiceRecorder from '../../../features/voice/hooks/useVoiceRecorder';

const ChatVoiceControls = ({
  onTranscription,
  disabled = false,
  autoSubmit = false,
  onSubmit,
  transcriptionMode = 'append'
}) => {
  const handleTranscriptionComplete = useCallback((text) => {
    if (!text) return;
    if (autoSubmit && onSubmit) {
      onSubmit(text);
    }
    onTranscription && onTranscription(text, transcriptionMode);
  }, [autoSubmit, onSubmit, onTranscription, transcriptionMode]);

  const {
    isRecording,
    isProcessing,
    error,
    hasTranscriptionFailed,
    startRecording,
    stopRecording,
    retryTranscription,
    processRecording
  } = useVoiceRecorder(handleTranscriptionComplete, { removeTimestamps: true });

  useEffect(() => {
    if (!isRecording) {
      processRecording();
    }
  }, [processRecording, isRecording]);

  const handleToggleRecording = () => {
    if (disabled) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="chat-voice-controls">
      <button
        type="button"
        className={`chat-voice-button ${isRecording ? 'recording' : ''}`}
        onClick={handleToggleRecording}
        disabled={disabled || isProcessing}
        aria-label={isRecording ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
      >
        {isProcessing ? (
          <Spinner size="small" />
        ) : isRecording ? (
          <FaStop />
        ) : (
          <FaMicrophone />
        )}
      </button>
      {hasTranscriptionFailed && (
        <button
          type="button"
          className="chat-voice-retry"
          onClick={retryTranscription}
          disabled={disabled}
        >
          <FaRedo />
        </button>
      )}
      {error && (
        <span className="chat-voice-error" role="alert">{error}</span>
      )}
      {isRecording && !isProcessing && (
        <span className="chat-voice-status">Aufnahme läuft…</span>
      )}
      {isProcessing && (
        <span className="chat-voice-status">Transkription…</span>
      )}
    </div>
  );
};

ChatVoiceControls.propTypes = {
  onTranscription: PropTypes.func,
  disabled: PropTypes.bool,
  autoSubmit: PropTypes.bool,
  onSubmit: PropTypes.func,
  transcriptionMode: PropTypes.oneOf(['append', 'replace'])
};

export default ChatVoiceControls;
