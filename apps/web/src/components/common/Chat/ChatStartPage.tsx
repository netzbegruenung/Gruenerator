import { motion } from 'motion/react';
import { type JSX, useState, FormEvent, type ReactNode } from 'react';


import AttachedFilesList from '../AttachedFilesList';

import ChatFileUploadButton from './ChatFileUploadButton';
import ChatSubmitButton from './ChatSubmitButton';
import useChatInput from './hooks/useChatInput';
import { handleEnterKeySubmit } from './utils/chatMessageUtils';
import './ChatStartPage.css';

const DEFAULT_FEATURES = [
  {
    title: 'Vielfältige Textformate',
    description:
      'Von Social-Media-Posts über Pressemitteilungen bis zu Anträgen – ich finde den passenden Stil automatisch.',
  },
  {
    title: 'Sharepics inklusive',
    description:
      'Direkt nutzbare Sharepics mit passenden Headlines, Farben und Varianten – inklusive Download.',
  },
  {
    title: 'Mehrere Ergebnisse',
    description:
      'Ich kann mehrere Antworten gleichzeitig liefern, z.\u00a0B. Textvorschlag und Sharepic auf einen Streich.',
  },
];

const DEFAULT_TIP = 'Starte z.\u00a0B. mit: „Schreib einen Instagram-Post über Solarenergie"';

interface AttachedFile {
  name: string;
  type?: string;
  size?: number;
}

interface ExampleQuestion {
  icon?: string;
  text?: string;
}

interface Feature {
  title?: string;
  description?: string;
}

interface Source {
  name?: string;
  count?: string;
  id?: string;
  selected?: boolean;
}

interface ChatStartPageProps {
  title?: string;
  placeholder?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: (value: string | React.FormEvent) => void;
  disabled?: boolean;
  enableFileUpload?: boolean;
  onFileSelect?: (files: File[]) => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  exampleQuestions?: ExampleQuestion[];
  variant?: 'default' | 'gruenerator';
  showFeatures?: boolean;
  showTip?: boolean;
  features?: Feature[];
  tipText?: string;
  isVoiceRecording?: boolean;
  isVoiceProcessing?: boolean;
  startRecording?: () => void;
  stopRecording?: () => void;
  sources?: Source[];
  onSourceToggle?: (id: string) => void;
  filterBar?: ReactNode;
  filterButton?: ReactNode;
}

const ChatStartPage = ({
  title = 'Was möchtest du wissen?',
  placeholder = 'Stell deine Frage...',
  inputValue = '',
  onInputChange,
  onSubmit,
  disabled = false,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile,
  exampleQuestions = [],
  variant = 'default',
  showFeatures = false,
  showTip = false,
  features = DEFAULT_FEATURES,
  tipText = DEFAULT_TIP,
  isVoiceRecording: externalIsVoiceRecording,
  isVoiceProcessing: externalIsVoiceProcessing,
  startRecording: externalStartRecording,
  stopRecording: externalStopRecording,
  sources = [],
  onSourceToggle,
  filterBar = null,
  filterButton = null,
}: ChatStartPageProps): JSX.Element => {
  const isGruenerator = variant === 'gruenerator';
  // Use internal hook only if voice props not provided from parent
  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice: false, // Don't auto-submit on start page
    enableVoiceRecording: !hasExternalVoice,
    onFileSelect,
  });

  // Use external props if provided, otherwise use internal hook values
  const isVoiceRecording = hasExternalVoice
    ? externalIsVoiceRecording
    : internalChatInput.isVoiceRecording;
  const isVoiceProcessing = hasExternalVoice
    ? externalIsVoiceProcessing
    : internalChatInput.isVoiceProcessing;
  const startRecording = hasExternalVoice
    ? externalStartRecording
    : internalChatInput.startRecording;
  const stopRecording = hasExternalVoice ? externalStopRecording : internalChatInput.stopRecording;

  const handleSubmit = (event: React.FormEvent | React.KeyboardEvent) => {
    event.preventDefault();
    const trimmedValue = (inputValue || '').trim();
    if (!trimmedValue || disabled) return;
    onSubmit?.(trimmedValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => handleEnterKeySubmit(event, handleSubmit);

  const handleExampleClick = (text: string | undefined) => {
    if (text) {
      onInputChange?.(text);
    }
  };

  const containerClass = isGruenerator
    ? 'chat-start-page chat-start-page--gruenerator'
    : 'chat-start-page';

  const titleAnimation = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: 0.1 },
  };

  return (
    <motion.div
      className={containerClass}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="chat-start-page-content">
        {isGruenerator ? (
          <motion.h2 className="chat-start-page-title" {...titleAnimation}>
            {title}
          </motion.h2>
        ) : (
          <motion.h1 className="chat-start-page-title" {...titleAnimation}>
            {title}
          </motion.h1>
        )}

        <motion.form
          className="chat-start-page-input-wrapper"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="chat-start-page-input-container">
            {enableFileUpload && attachedFiles.length > 0 && (
              <AttachedFilesList
                files={attachedFiles}
                onRemoveFile={onRemoveFile}
                className="chat-start-page-attached-files"
              />
            )}
            <textarea
              value={inputValue}
              onChange={(event) => onInputChange && onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="chat-start-page-input"
            />
            <div className="chat-start-page-buttons">
              {filterButton}
              <ChatFileUploadButton
                enabled={enableFileUpload}
                disabled={disabled}
                onFileSelect={onFileSelect}
                className="chat-start-page-file-button"
              />
              <ChatSubmitButton
                inputValue={inputValue}
                isVoiceRecording={isVoiceRecording}
                isVoiceProcessing={isVoiceProcessing}
                onSubmit={handleSubmit}
                startRecording={startRecording}
                stopRecording={stopRecording}
                disabled={disabled}
                iconSize={20}
                className="chat-start-page-submit-button"
              />
            </div>
          </div>
        </motion.form>

        {filterBar && (
          <motion.div
            className="chat-start-page-active-filters"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            {filterBar}
          </motion.div>
        )}

        {exampleQuestions.length > 0 && (
          <motion.div
            className="chat-start-page-examples"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: isGruenerator ? 0.25 : 0.3 }}
          >
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="chat-start-page-example"
                onClick={() => handleExampleClick(question.text)}
              >
                <span>{question.icon}</span>
                <span>{question.text}</span>
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {((isGruenerator && showFeatures !== false) || showFeatures) && features.length > 0 && (
        <motion.div
          className="chat-start-page-features"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {features.map((feature, index) => (
            <div key={index} className="chat-start-page-feature">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </motion.div>
      )}

      {((isGruenerator && showTip !== false) || showTip) && tipText && (
        <motion.div
          className="chat-start-page-tip"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <span className="chat-start-page-tip-label">Tipp</span>
          <p>{tipText}</p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ChatStartPage;
