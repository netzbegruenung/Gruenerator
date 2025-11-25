import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop, FaPlus } from 'react-icons/fa';
import ChatUI from './ChatUI';
import ModeSelector from './ModeSelector';
import useVoiceRecorder from '../../../features/voice/hooks/useVoiceRecorder';
import useIsMobile from '../../../hooks/useIsMobile';
import AttachedFilesList from '../AttachedFilesList';
import FloatingAssistantBubble from './FloatingAssistantBubble';
import MobileSwipeContainer from './MobileSwipeContainer';
import '../../../assets/styles/components/chat/chat-workbench.css';

const ChatWorkbenchLayout = ({
  mode,
  modes,
  onModeChange,
  title,
  headerContent,
  messages,
  onSubmit,
  isProcessing,
  placeholder,
  inputValue,
  onInputChange,
  disabled,
  renderMessage,
  rightPanelContent,
  rightPanelFooter,
  infoPanelContent,
  className = '',
  submitLabel = null,
  isEditModeActive = false,
  hideModeSelector = false,
  hideHeader = false,
  onVoiceRecorderTranscription,
  autoSubmitVoice = true,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile
}) => {
  const isMobile = useIsMobile();
  const [dismissedMessageTimestamp, setDismissedMessageTimestamp] = useState(null);
  const [mobileActivePanel, setMobileActivePanel] = useState('results');

  const latestAssistantMessage = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'assistant') {
        if (messages[i].content?.startsWith('Hallo! Ich bin der Grünerator Chat.')) {
          continue;
        }
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  const voiceRecorderHook = useVoiceRecorder((text) => {
    // Update the input field with transcribed text
    if (onInputChange) {
      const newValue = inputValue ? `${inputValue} ${text}`.trim() : text;
      onInputChange(newValue);
    }
    // Also call the callback if provided
    onVoiceRecorderTranscription && onVoiceRecorderTranscription(text);
  }, { removeTimestamps: true });

  const {
    isRecording: isVoiceRecording,
    isProcessing: isVoiceProcessing,
    startRecording,
    stopRecording,
    processRecording
  } = voiceRecorderHook;

  const fileInputRef = useRef(null);

  const handleFileUploadClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback((event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0 && onFileSelect) {
      onFileSelect(files);
    }
    // Reset file input to allow selecting the same file again
    event.target.value = '';
  }, [onFileSelect]);

  // Process recording for transcription when recording stops
  useEffect(() => {
    if (!isVoiceRecording) {
      processRecording();
    }
  }, [isVoiceRecording, processRecording]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedValue = (inputValue || '').trim();
    if (!trimmedValue || disabled) return;
    onSubmit(trimmedValue);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const renderModeSelector = () => (
    <ModeSelector
      currentMode={mode}
      modes={modes}
      onModeChange={onModeChange}
      className="qa-chat-mode-selector"
    />
  );


  const renderInputWrapper = () => {
    const hasText = (inputValue || '').trim();
    const effectiveSubmitLabel = hasText ?
      (submitLabel ?? <BsArrowUpCircleFill size={18} />) :
      (isVoiceRecording ? <FaStop size={18} /> : <FaMicrophone size={18} />);

    const handleButtonClick = () => {
      if (hasText) {
        handleSubmit({ preventDefault: () => {} });
      } else if (isVoiceRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };

    return (
      <form
        className="qa-chat-dossier-input-wrapper"
        onSubmit={handleSubmit}
      >
        {/* Temporarily hidden until chat mode CSS is complete */}
        {/* {!hideModeSelector && renderModeSelector()} */}
        <div className="textarea-wrapper">
          {enableFileUpload && attachedFiles.length > 0 && (
            <AttachedFilesList
              files={attachedFiles}
              onRemoveFile={onRemoveFile}
              className="chat-attached-files"
            />
          )}
          <textarea
            value={inputValue}
            onChange={(event) => onInputChange && onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
          />
          {enableFileUpload && (
            <>
              <button
                type="button"
                className="chat-file-upload-button chat-file-upload-button-workbench"
                onClick={handleFileUploadClick}
                disabled={disabled}
                aria-label="Datei hinzufügen"
              >
                <FaPlus />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </>
          )}
          <button
            type={hasText ? "submit" : "button"}
            onClick={!hasText ? handleButtonClick : undefined}
            disabled={disabled || isVoiceProcessing}
            className={isVoiceRecording ? 'voice-recording' : ''}
          >
            {effectiveSubmitLabel}
          </button>
        </div>
      </form>
    );
  };


  const renderHeader = () => {
    if (hideHeader || (!title && !headerContent)) return null;

    return (
      <div className="chat-header">
        <div className="chat-header-content">
          {headerContent || (title ? <h2>{title}</h2> : null)}
          {isEditModeActive && (
            <span className="qa-chat-edit-badge">Edit-Modus aktiv</span>
          )}
        </div>
      </div>
    );
  };

  const renderMobileDossierMode = () => {
    const shouldShowBubble = mobileActivePanel === 'results' &&
      latestAssistantMessage &&
      latestAssistantMessage.timestamp !== dismissedMessageTimestamp;

    const chatPanel = (
      <div className="mobile-chat-panel-content">
        {renderHeader()}
        <ChatUI
          messages={messages}
          onSubmit={onSubmit}
          isProcessing={isProcessing}
          placeholder={placeholder}
          inputValue={inputValue}
          onInputChange={onInputChange}
          disabled={disabled}
          className="qa-chat-ui mobile-swipe-panel-chat"
          showHeader={false}
          renderInput={() => null}
          onVoiceRecorderTranscription={onVoiceRecorderTranscription}
          autoSubmitVoice={autoSubmitVoice}
          enableFileUpload={enableFileUpload}
          onFileSelect={onFileSelect}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
        />
      </div>
    );

    const resultsPanel = (
      <div className="mobile-results-panel-content">
        {shouldShowBubble && (
          <FloatingAssistantBubble
            message={latestAssistantMessage}
            onDismiss={() => setDismissedMessageTimestamp(latestAssistantMessage.timestamp)}
            onActionClick={onSubmit}
            isProcessing={isProcessing}
          />
        )}
        {rightPanelContent}
        {rightPanelFooter}
      </div>
    );

    return (
      <div className="qa-chat-main qa-chat-dossier qa-chat-dossier-mobile">
        <MobileSwipeContainer
          chatPanel={chatPanel}
          resultsPanel={resultsPanel}
          activePanel={mobileActivePanel}
          onPanelChange={setMobileActivePanel}
          inputElement={renderInputWrapper()}
        />
      </div>
    );
  };

  const renderDesktopDossierMode = () => (
    <div className="qa-chat-main qa-chat-dossier">
      <div className="qa-chat-left-panel">
        {renderHeader()}
        <ChatUI
          messages={messages}
          onSubmit={onSubmit}
          isProcessing={isProcessing}
          placeholder={placeholder}
          inputValue={inputValue}
          onInputChange={onInputChange}
          disabled={disabled}
          className="qa-chat-ui"
          renderInput={renderInputWrapper}
          showHeader={false}
          onVoiceRecorderTranscription={onVoiceRecorderTranscription}
          autoSubmitVoice={autoSubmitVoice}
          enableFileUpload={enableFileUpload}
          onFileSelect={onFileSelect}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
        />
      </div>
      <div className="qa-chat-right-panel">
        {rightPanelContent}
        {rightPanelFooter}
      </div>
    </div>
  );

  const renderDossierMode = () => isMobile ? renderMobileDossierMode() : renderDesktopDossierMode();

  const renderChatMode = () => (
    <div className="qa-chat-main qa-chat-fullscreen">
      <div className="qa-chat-fullscreen-content">
        <ChatUI
          messages={messages}
          onSubmit={onSubmit}
          isProcessing={isProcessing}
          placeholder={placeholder}
          inputValue={inputValue}
          onInputChange={onInputChange}
          disabled={disabled}
          className="qa-chat-ui qa-chat-ui-fullscreen"
          fullScreen={true}
          renderMessage={renderMessage}
          showHeader={false}
          onVoiceRecorderTranscription={onVoiceRecorderTranscription}
          autoSubmitVoice={autoSubmitVoice}
          enableFileUpload={enableFileUpload}
          onFileSelect={onFileSelect}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
        />
      </div>
      {infoPanelContent}
    </div>
  );

  return (
    <motion.div
      className={`qa-chat-container qa-chat-${mode} ${isEditModeActive ? 'qa-chat-edit-active' : ''} ${className}`.trim()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {mode === 'dossier' ? renderDossierMode() : renderChatMode()}
    </motion.div>
  );
};

ChatWorkbenchLayout.propTypes = {
  mode: PropTypes.string.isRequired,
  modes: PropTypes.object.isRequired,
  onModeChange: PropTypes.func.isRequired,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  headerContent: PropTypes.node,
  messages: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.oneOf(['user', 'assistant', 'error']).isRequired,
    content: PropTypes.string.isRequired,
    timestamp: PropTypes.number,
    userName: PropTypes.string
  })),
  onSubmit: PropTypes.func,
  isProcessing: PropTypes.bool,
  placeholder: PropTypes.string,
  inputValue: PropTypes.string,
  onInputChange: PropTypes.func,
  disabled: PropTypes.bool,
  renderMessage: PropTypes.func,
  rightPanelContent: PropTypes.node,
  rightPanelFooter: PropTypes.node,
  infoPanelContent: PropTypes.node,
  className: PropTypes.string,
  submitLabel: PropTypes.node,
  isEditModeActive: PropTypes.bool,
  hideModeSelector: PropTypes.bool,
  hideHeader: PropTypes.bool,
  onVoiceRecorderTranscription: PropTypes.func,
  enableFileUpload: PropTypes.bool,
  onFileSelect: PropTypes.func,
  attachedFiles: PropTypes.array,
  onRemoveFile: PropTypes.func
};

export default ChatWorkbenchLayout;
