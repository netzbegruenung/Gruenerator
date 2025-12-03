import React, { useCallback, useState, useEffect, lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop, FaPlus } from 'react-icons/fa';
import ChatUI from './ChatUI';
import ChatStartPage from './ChatStartPage';
import ModeSelector from './ModeSelector';
import useChatInput from './hooks/useChatInput';
import AttachedFilesList from '../AttachedFilesList';
import '../../../assets/styles/components/chat/chat-workbench.css';

const GrueneratorChatStartPage = lazy(() => import('../../../features/chat/components/GrueneratorChatStartPage'));

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
  onRemoveFile,
  singleLine = false,
  showStartPage = false,
  startPageTitle = "Was möchtest du wissen?",
  startPageComponent = null
}) => {
  // Consolidated voice recording and file upload via useChatInput hook
  const {
    isVoiceRecording,
    isVoiceProcessing,
    startRecording,
    stopRecording,
    fileInputRef,
    handleFileUploadClick,
    handleFileChange
  } = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice,
    enableVoiceRecording: true,
    onVoiceTranscription: onVoiceRecorderTranscription,
    onFileSelect
  });

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

  const renderDossierMode = () => {
    const hasUserMessage = messages?.some(msg => msg.type === 'user');
    const StartPageComponent = startPageComponent;

    if (showStartPage && !hasUserMessage && StartPageComponent) {
      return (
        <div className="qa-chat-main qa-chat-fullscreen-start">
          <Suspense fallback={<div className="qa-chat-loading" />}>
            <StartPageComponent
              title={startPageTitle}
              placeholder={placeholder}
              inputValue={inputValue}
              onInputChange={onInputChange}
              onSubmit={onSubmit}
              disabled={disabled || isProcessing}
              enableFileUpload={enableFileUpload}
              onFileSelect={onFileSelect}
              attachedFiles={attachedFiles}
              onRemoveFile={onRemoveFile}
              isVoiceRecording={isVoiceRecording}
              isVoiceProcessing={isVoiceProcessing}
              startRecording={startRecording}
              stopRecording={stopRecording}
              fileInputRef={fileInputRef}
              handleFileUploadClick={handleFileUploadClick}
              handleFileChange={handleFileChange}
            />
          </Suspense>
        </div>
      );
    }

    return (
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
            autoSubmitVoice={autoSubmitVoice}
            enableFileUpload={enableFileUpload}
            attachedFiles={attachedFiles}
            onRemoveFile={onRemoveFile}
            singleLine={singleLine}
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            startRecording={startRecording}
            stopRecording={stopRecording}
          />
        </div>
        <div className="qa-chat-right-panel">
          {rightPanelContent}
          {rightPanelFooter}
        </div>
      </div>
    );
  };

  const renderChatMode = () => {
    const hasUserMessage = messages?.some(msg => msg.type === 'user');

    if (showStartPage && !hasUserMessage) {
      return (
        <div className="qa-chat-main qa-chat-fullscreen">
          <ChatStartPage
            title={startPageTitle}
            placeholder={placeholder}
            inputValue={inputValue}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            disabled={disabled || isProcessing}
            enableFileUpload={enableFileUpload}
            onFileSelect={onFileSelect}
            attachedFiles={attachedFiles}
            onRemoveFile={onRemoveFile}
            // Pass voice recording state from parent
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            startRecording={startRecording}
            stopRecording={stopRecording}
            // Pass file input ref from parent
            fileInputRef={fileInputRef}
            handleFileUploadClick={handleFileUploadClick}
            handleFileChange={handleFileChange}
          />
        </div>
      );
    }

    return (
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
            autoSubmitVoice={autoSubmitVoice}
            enableFileUpload={enableFileUpload}
            attachedFiles={attachedFiles}
            onRemoveFile={onRemoveFile}
            singleLine={singleLine}
            // Pass voice recording state from parent
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            startRecording={startRecording}
            stopRecording={stopRecording}
          />
        </div>
        {!hasUserMessage && infoPanelContent}
      </div>
    );
  };

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
  onRemoveFile: PropTypes.func,
  singleLine: PropTypes.bool,
  showStartPage: PropTypes.bool,
  startPageTitle: PropTypes.string,
  startPageComponent: PropTypes.elementType
};

export default ChatWorkbenchLayout;
