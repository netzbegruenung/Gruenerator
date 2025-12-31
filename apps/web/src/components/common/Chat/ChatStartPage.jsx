import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi';
import useChatInput from './hooks/useChatInput';
import AttachedFilesList from '../AttachedFilesList';
import ChatSubmitButton from './ChatSubmitButton';
import ChatFileUploadButton from './ChatFileUploadButton';
import { handleEnterKeySubmit } from './utils/chatMessageUtils';
import './ChatStartPage.css';

const DEFAULT_FEATURES = [
  {
    title: "Vielfältige Textformate",
    description: "Von Social-Media-Posts über Pressemitteilungen bis zu Anträgen – ich finde den passenden Stil automatisch."
  },
  {
    title: "Sharepics inklusive",
    description: "Direkt nutzbare Sharepics mit passenden Headlines, Farben und Varianten – inklusive Download."
  },
  {
    title: "Mehrere Ergebnisse",
    description: "Ich kann mehrere Antworten gleichzeitig liefern, z.\u00a0B. Textvorschlag und Sharepic auf einen Streich."
  }
];

const DEFAULT_TIP = "Starte z.\u00a0B. mit: „Schreib einen Instagram-Post über Solarenergie\"";

const ChatStartPage = ({
  title = "Was möchtest du wissen?",
  placeholder = "Stell deine Frage...",
  inputValue = "",
  onInputChange,
  onSubmit,
  disabled = false,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile,
  exampleQuestions = [],
  variant = "default",
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
  filterButton = null
}) => {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isGruenerator = variant === "gruenerator";
  // Use internal hook only if voice props not provided from parent
  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice: false, // Don't auto-submit on start page
    enableVoiceRecording: !hasExternalVoice,
    onFileSelect
  });

  // Use external props if provided, otherwise use internal hook values
  const isVoiceRecording = hasExternalVoice ? externalIsVoiceRecording : internalChatInput.isVoiceRecording;
  const isVoiceProcessing = hasExternalVoice ? externalIsVoiceProcessing : internalChatInput.isVoiceProcessing;
  const startRecording = hasExternalVoice ? externalStartRecording : internalChatInput.startRecording;
  const stopRecording = hasExternalVoice ? externalStopRecording : internalChatInput.stopRecording;

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedValue = (inputValue || '').trim();
    if (!trimmedValue || disabled) return;
    onSubmit(trimmedValue);
  };

  const handleKeyDown = (event) => handleEnterKeySubmit(event, handleSubmit);

  const handleExampleClick = (text) => {
    onInputChange && onInputChange(text);
  };

  const containerClass = isGruenerator
    ? "chat-start-page chat-start-page--gruenerator"
    : "chat-start-page";

  const titleAnimation = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: 0.1 }
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

        {sources.length > 0 && (
          <motion.div
            className="chat-start-page-sources"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <button
              type="button"
              className="chat-start-page-sources-toggle"
              onClick={() => setSourcesExpanded(!sourcesExpanded)}
            >
              {sourcesExpanded ? <HiChevronDown /> : <HiChevronRight />}
              <span>Welche Notebooks werden durchsucht?</span>
            </button>
            {sourcesExpanded && (
              <div className="chat-start-page-sources-list">
                {sources.map((source, index) => {
                  const isSelected = source.selected !== false;
                  const selectedCount = sources.filter(s => s.selected !== false).length;
                  const canToggle = onSourceToggle && (selectedCount > 1 || !isSelected);

                  return (
                    <button
                      key={source.id || index}
                      type="button"
                      className={`chat-start-page-source-item ${onSourceToggle ? 'chat-start-page-source-item--selectable' : ''} ${isSelected ? 'chat-start-page-source-item--selected' : ''}`}
                      onClick={() => canToggle && onSourceToggle(source.id)}
                      disabled={!canToggle && onSourceToggle}
                    >
                      {onSourceToggle && (
                        <span className={`chat-start-page-source-checkbox ${isSelected ? 'chat-start-page-source-checkbox--checked' : ''}`}>
                          {isSelected && '✓'}
                        </span>
                      )}
                      <span className="chat-start-page-source-name">{source.name}</span>
                      <span className="chat-start-page-source-count">{source.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
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

ChatStartPage.propTypes = {
  title: PropTypes.string,
  placeholder: PropTypes.string,
  inputValue: PropTypes.string,
  onInputChange: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  enableFileUpload: PropTypes.bool,
  onFileSelect: PropTypes.func,
  attachedFiles: PropTypes.array,
  onRemoveFile: PropTypes.func,
  exampleQuestions: PropTypes.arrayOf(PropTypes.shape({
    icon: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })),
  variant: PropTypes.oneOf(['default', 'gruenerator']),
  showFeatures: PropTypes.bool,
  showTip: PropTypes.bool,
  features: PropTypes.arrayOf(PropTypes.shape({
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired
  })),
  tipText: PropTypes.string,
  isVoiceRecording: PropTypes.bool,
  isVoiceProcessing: PropTypes.bool,
  startRecording: PropTypes.func,
  stopRecording: PropTypes.func,
  sources: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    count: PropTypes.string.isRequired,
    id: PropTypes.string,
    selected: PropTypes.bool
  })),
  onSourceToggle: PropTypes.func,
  filterBar: PropTypes.node,
  filterButton: PropTypes.node
};

export default ChatStartPage;
