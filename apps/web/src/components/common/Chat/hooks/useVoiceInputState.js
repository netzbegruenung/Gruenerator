import useChatInput from './useChatInput';

/**
 * Consolidates external/internal voice state pattern.
 * Use this when a component can receive voice state from parent OR manage its own.
 *
 * @param {Object} options
 * @param {Object} options.externalVoiceProps - Voice props passed from parent (optional)
 * @param {boolean} options.externalVoiceProps.isVoiceRecording
 * @param {boolean} options.externalVoiceProps.isVoiceProcessing
 * @param {Function} options.externalVoiceProps.startRecording
 * @param {Function} options.externalVoiceProps.stopRecording
 * @param {Object} options.chatInputConfig - Config for internal useChatInput hook
 */
const useVoiceInputState = ({ externalVoiceProps = {}, chatInputConfig = {} }) => {
  const {
    isVoiceRecording: externalIsVoiceRecording,
    isVoiceProcessing: externalIsVoiceProcessing,
    startRecording: externalStartRecording,
    stopRecording: externalStopRecording,
  } = externalVoiceProps;

  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    ...chatInputConfig,
    enableVoiceRecording: !hasExternalVoice,
  });

  return {
    isVoiceRecording: hasExternalVoice
      ? externalIsVoiceRecording
      : internalChatInput.isVoiceRecording,
    isVoiceProcessing: hasExternalVoice
      ? externalIsVoiceProcessing
      : internalChatInput.isVoiceProcessing,
    startRecording: hasExternalVoice ? externalStartRecording : internalChatInput.startRecording,
    stopRecording: hasExternalVoice ? externalStopRecording : internalChatInput.stopRecording,
    fileInputRef: internalChatInput.fileInputRef,
    handleFileUploadClick: internalChatInput.handleFileUploadClick,
    handleFileChange: internalChatInput.handleFileChange,
    hasExternalVoice,
  };
};

export default useVoiceInputState;
