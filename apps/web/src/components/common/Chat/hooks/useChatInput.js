import { useState, useRef, useCallback, useEffect } from 'react';
import useVoiceRecorder from '../../../../features/voice/hooks/useVoiceRecorder';

/**
 * Consolidated hook for chat input functionality.
 * Manages voice recording and file upload in a single place.
 *
 * @param {Object} options
 * @param {string} options.inputValue - Current input value
 * @param {Function} options.onInputChange - Callback to update input value
 * @param {Function} options.onSubmit - Callback to submit message
 * @param {boolean} options.autoSubmitVoice - Auto-submit after voice transcription (default: true)
 * @param {boolean} options.enableVoiceRecording - Enable voice recording (default: true)
 * @param {boolean} options.enableFileUpload - Enable file upload (default: false)
 * @param {Function} options.onVoiceTranscription - Optional callback after transcription
 * @param {Function} options.onFileSelect - Optional callback when files are selected
 */
const useChatInput = ({
  inputValue = '',
  onInputChange,
  onSubmit,
  autoSubmitVoice = true,
  enableVoiceRecording = true,
  onVoiceTranscription,
  onFileSelect
}) => {
  // Voice recording - single instance
  const handleTranscription = useCallback((text) => {
    if (!text) return;

    const newValue = inputValue ? `${inputValue} ${text}`.trim() : text;
    onInputChange?.(newValue);

    if (autoSubmitVoice && onSubmit) {
      setTimeout(() => {
        onSubmit(newValue);
        onInputChange?.('');
      }, 100);
    }

    onVoiceTranscription?.(text);
  }, [inputValue, onInputChange, onSubmit, autoSubmitVoice, onVoiceTranscription]);

  const voiceRecorder = useVoiceRecorder(handleTranscription, { removeTimestamps: true });

  // Auto-process recording when stopped
  useEffect(() => {
    if (!voiceRecorder.isRecording) {
      voiceRecorder.processRecording();
    }
  }, [voiceRecorder.isRecording, voiceRecorder.processRecording]);

  // File upload
  const fileInputRef = useRef(null);
  const [internalAttachedFiles, setInternalAttachedFiles] = useState([]);

  const handleFileUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      setInternalAttachedFiles(files);
      onFileSelect?.(files);
    }
    event.target.value = '';
  }, [onFileSelect]);

  const handleRemoveFile = useCallback((index) => {
    setInternalAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setInternalAttachedFiles([]);
  }, []);

  return {
    // Voice recording
    isVoiceRecording: enableVoiceRecording ? voiceRecorder.isRecording : false,
    isVoiceProcessing: enableVoiceRecording ? voiceRecorder.isProcessing : false,
    startRecording: enableVoiceRecording ? voiceRecorder.startRecording : () => {},
    stopRecording: enableVoiceRecording ? voiceRecorder.stopRecording : () => {},
    voiceError: enableVoiceRecording ? voiceRecorder.error : null,

    // File upload
    fileInputRef,
    internalAttachedFiles,
    handleFileUploadClick,
    handleFileChange,
    handleRemoveFile,
    clearFiles
  };
};

export default useChatInput;
