import { motion } from 'motion/react';

import AttachedFilesList from '../AttachedFilesList';

import ChatFileUploadButton from './ChatFileUploadButton';
import ChatStartPage from './ChatStartPage';
import ChatSubmitButton from './ChatSubmitButton';
import ChatUI from './ChatUI';
import useChatInput from './hooks/useChatInput';
// DEPRECATED: ModeSelector removed - all consumers use 'chat' mode only
// import ModeSelector from './ModeSelector';
import { handleEnterKeySubmit } from './utils/chatMessageUtils';

import type { JSX, ReactNode, FormEvent } from 'react';
import '../../../assets/styles/components/chat/chat-workbench.css';

interface ChatMessage {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp?: number;
  userName?: string;
  quotedText?: string;
  attachments?: Array<{ type?: string; name: string }>;
  actions?: Array<{ value: string; label?: string }>;
  isEditResult?: boolean;
  editSummary?: string;
}

interface AttachedFile {
  name: string;
  type?: string;
  size?: number;
}

interface WorkbenchModeConfig {
  label?: string;
  icon?: React.ComponentType;
  title?: string;
  description?: string;
}

interface Source {
  name?: string;
  count?: string;
  id?: string;
  selected?: boolean;
}

interface ExampleQuestion {
  icon?: string;
  text?: string;
}

interface ChatWorkbenchLayoutProps {
  // DEPRECATED: mode, modes, onModeChange removed - all consumers use 'chat' mode only
  mode?: string; // Kept for backwards compatibility, ignored
  modes?: Record<string, WorkbenchModeConfig>; // Kept for backwards compatibility, ignored
  onModeChange?: (mode: string) => void; // Kept for backwards compatibility, ignored
  title?: string | number;
  headerContent?: ReactNode;
  messages: ChatMessage[];
  onSubmit?: (value: string | React.FormEvent) => void;
  isProcessing?: boolean;
  placeholder?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  disabled?: boolean;
  renderMessage?: (message: ChatMessage, index: number) => ReactNode;
  rightPanelContent?: ReactNode;
  rightPanelFooter?: ReactNode;
  infoPanelContent?: ReactNode;
  className?: string;
  submitLabel?: ReactNode;
  isEditModeActive?: boolean;
  // DEPRECATED: hideModeSelector removed - mode selector no longer exists
  hideModeSelector?: boolean; // Kept for backwards compatibility, ignored
  hideHeader?: boolean;
  onVoiceRecorderTranscription?: (text: string) => void;
  autoSubmitVoice?: boolean;
  enableFileUpload?: boolean;
  onFileSelect?: (files: File[]) => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  singleLine?: boolean;
  showStartPage?: boolean;
  startPageTitle?: string;
  exampleQuestions?: ExampleQuestion[];
  sources?: Source[];
  onSourceToggle?: (id: string) => void;
  filterBar?: ReactNode;
  filterButton?: ReactNode;
  onReset?: () => void;
}

const ChatWorkbenchLayout = ({
  // DEPRECATED: mode, modes, onModeChange - unused, kept for backwards compatibility
  mode: _mode,
  modes: _modes,
  onModeChange: _onModeChange,
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
  rightPanelContent: _rightPanelContent, // DEPRECATED: only used in dossier mode
  rightPanelFooter: _rightPanelFooter, // DEPRECATED: only used in dossier mode
  infoPanelContent,
  className = '',
  submitLabel = null,
  isEditModeActive = false,
  hideModeSelector: _hideModeSelector = false, // DEPRECATED: unused
  hideHeader = false,
  onVoiceRecorderTranscription,
  autoSubmitVoice = true,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile,
  singleLine = false,
  showStartPage = false,
  startPageTitle = 'Was möchtest du wissen?',
  exampleQuestions = [],
  sources = [],
  onSourceToggle,
  filterBar = null,
  filterButton = null,
  onReset: _onReset, // DEPRECATED: unused
}: ChatWorkbenchLayoutProps): JSX.Element => {
  // Consolidated voice recording via useChatInput hook
  const { isVoiceRecording, isVoiceProcessing, startRecording, stopRecording } = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice,
    enableVoiceRecording: true,
    onVoiceTranscription: onVoiceRecorderTranscription,
    onFileSelect,
  });

  const handleSubmit = (event: React.FormEvent | React.KeyboardEvent) => {
    event.preventDefault();
    const trimmedValue = (inputValue || '').trim();
    if (!trimmedValue || disabled) return;
    onSubmit?.(trimmedValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => handleEnterKeySubmit(event, handleSubmit);

  // DEPRECATED: renderModeSelector removed - all consumers use 'chat' mode only
  // const renderModeSelector = () => (
  //   <ModeSelector
  //     currentMode={mode}
  //     modes={modes}
  //     onModeChange={onModeChange}
  //     className="qa-chat-mode-selector"
  //   />
  // );

  // DEPRECATED: renderInputWrapper only used in dossier mode
  const _renderInputWrapper = () => {
    return (
      <form className="qa-chat-dossier-input-wrapper" onSubmit={handleSubmit}>
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

  // DEPRECATED: renderHeader only used in dossier mode
  const _renderHeader = () => {
    if (hideHeader || (!title && !headerContent)) return null;

    return (
      <div className="chat-header">
        <div className="chat-header-content">
          {headerContent || (title ? <h2>{title}</h2> : null)}
          {isEditModeActive && <span className="qa-chat-edit-badge">Edit-Modus aktiv</span>}
        </div>
      </div>
    );
  };

  // DEPRECATED: renderDossierMode removed - all consumers use 'chat' mode only
  // const renderDossierMode = () => {
  //   const hasUserMessage = messages?.some((msg) => msg.type === 'user');
  //
  //   if (showStartPage && !hasUserMessage) {
  //     return (
  //       <div className="qa-chat-main qa-chat-fullscreen-start">
  //         <ChatStartPage
  //           variant="gruenerator"
  //           title={startPageTitle}
  //           placeholder={placeholder}
  //           inputValue={inputValue}
  //           onInputChange={onInputChange}
  //           onSubmit={onSubmit}
  //           disabled={disabled || isProcessing}
  //           enableFileUpload={enableFileUpload}
  //           onFileSelect={onFileSelect}
  //           attachedFiles={attachedFiles}
  //           onRemoveFile={onRemoveFile}
  //           exampleQuestions={exampleQuestions}
  //           sources={sources}
  //           onSourceToggle={onSourceToggle}
  //           filterBar={filterBar}
  //           filterButton={filterButton}
  //           isVoiceRecording={isVoiceRecording}
  //           isVoiceProcessing={isVoiceProcessing}
  //           startRecording={startRecording}
  //           stopRecording={stopRecording}
  //         />
  //       </div>
  //     );
  //   }
  //
  //   return (
  //     <div className="qa-chat-main qa-chat-dossier">
  //       <div className="qa-chat-left-panel">
  //         {renderHeader()}
  //         <ChatUI
  //           messages={messages}
  //           onSubmit={onSubmit}
  //           isProcessing={isProcessing}
  //           placeholder={placeholder}
  //           inputValue={inputValue}
  //           onInputChange={onInputChange}
  //           disabled={disabled}
  //           className="qa-chat-ui"
  //           renderInput={renderInputWrapper}
  //           showHeader={false}
  //           autoSubmitVoice={autoSubmitVoice}
  //           enableFileUpload={enableFileUpload}
  //           attachedFiles={attachedFiles}
  //           onRemoveFile={onRemoveFile}
  //           singleLine={singleLine}
  //           isVoiceRecording={isVoiceRecording}
  //           isVoiceProcessing={isVoiceProcessing}
  //           startRecording={startRecording}
  //           stopRecording={stopRecording}
  //         />
  //       </div>
  //       <div className="qa-chat-right-panel">
  //         {rightPanelContent}
  //         {rightPanelFooter}
  //       </div>
  //     </div>
  //   );
  // };

  const renderChatMode = () => {
    const hasUserMessage = messages?.some((msg) => msg.type === 'user');

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
      className={`qa-chat-container qa-chat-chat ${isEditModeActive ? 'qa-chat-edit-active' : ''} ${className}`.trim()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {renderChatMode()}
    </motion.div>
  );
};

export default ChatWorkbenchLayout;
