import type { ReactNode, FormEvent } from 'react';
import { motion } from 'motion/react';
import ChatUI from './ChatUI';
import ChatStartPage from './ChatStartPage';
import ModeSelector from './ModeSelector';
import useChatInput from './hooks/useChatInput';
import AttachedFilesList from '../AttachedFilesList';
import ChatSubmitButton from './ChatSubmitButton';
import ChatFileUploadButton from './ChatFileUploadButton';
import { handleEnterKeySubmit } from './utils/chatMessageUtils';
import '../../../assets/styles/components/chat/chat-workbench.css';

interface ChatWorkbenchLayoutProps {
  mode: string;
  modes: Record<string, unknown>;
  onModeChange: () => void;
  title?: string | number;
  headerContent?: ReactNode;
  messages: 'user' | 'assistant' | 'error';
  onSubmit?: (event: React.FormEvent) => void;
  isProcessing?: boolean;
  placeholder?: string;
  inputValue?: string;
  onInputChange?: () => void;
  disabled?: boolean;
  renderMessage?: () => void;
  rightPanelContent?: ReactNode;
  rightPanelFooter?: ReactNode;
  infoPanelContent?: ReactNode;
  className?: string;
  submitLabel?: ReactNode;
  isEditModeActive?: boolean;
  hideModeSelector?: boolean;
  hideHeader?: boolean;
  onVoiceRecorderTranscription?: () => void;
  enableFileUpload?: boolean;
  onFileSelect?: () => void;
  attachedFiles?: unknown[];
  onRemoveFile?: () => void;
  singleLine?: boolean;
  showStartPage?: boolean;
  startPageTitle?: string;
  exampleQuestions: {
    icon?: string;
    text?: string
  }[];
  sources: {
    name?: string;
    count?: string;
    id?: string;
    selected?: boolean
  }[];
  onSourceToggle?: () => void;
  filterBar?: ReactNode;
  filterButton?: ReactNode;
}

const ChatWorkbenchLayout = ({ mode,
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
  exampleQuestions = [],
  sources = [],
  onSourceToggle,
  filterBar = null,
  filterButton = null }: ChatWorkbenchLayoutProps): JSX.Element => {
  // Consolidated voice recording via useChatInput hook
  const {
    isVoiceRecording,
    isVoiceProcessing,
    startRecording,
    stopRecording
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

  const handleKeyDown = (event) => handleEnterKeySubmit(event, handleSubmit);

  const renderModeSelector = () => (
    <ModeSelector
      currentMode={mode}
      modes={modes}
      onModeChange={onModeChange}
      className="qa-chat-mode-selector"
    />
  );

  const renderInputWrapper = () => {
    return (
      <form
        className="qa-chat-dossier-input-wrapper"
        onSubmit={handleSubmit}
      >
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
          <ChatFileUploadButton
            enabled={enableFileUpload}
            disabled={disabled}
            onFileSelect={onFileSelect}
            className="chat-file-upload-button chat-file-upload-button-workbench"
          />
          <ChatSubmitButton
            inputValue={inputValue}
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            onSubmit={handleSubmit}
            startRecording={startRecording}
            stopRecording={stopRecording}
            disabled={disabled}
            submitIcon={submitLabel}
          />
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

    if (showStartPage && !hasUserMessage) {
      return (
        <div className="qa-chat-main qa-chat-fullscreen-start">
          <ChatStartPage
            variant="gruenerator"
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
            exampleQuestions={exampleQuestions}
            sources={sources}
            onSourceToggle={onSourceToggle}
            filterBar={filterBar}
            filterButton={filterButton}
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            startRecording={startRecording}
            stopRecording={stopRecording}
          />
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
            variant="gruenerator"
            showFeatures={false}
            showTip={false}
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
            exampleQuestions={exampleQuestions}
            sources={sources}
            onSourceToggle={onSourceToggle}
            filterBar={filterBar}
            filterButton={filterButton}
            isVoiceRecording={isVoiceRecording}
            isVoiceProcessing={isVoiceProcessing}
            startRecording={startRecording}
            stopRecording={stopRecording}
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

export default ChatWorkbenchLayout;
