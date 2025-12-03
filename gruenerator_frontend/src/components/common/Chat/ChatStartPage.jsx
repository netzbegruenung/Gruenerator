import React, { useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop, FaPlus } from 'react-icons/fa';
import useChatInput from './hooks/useChatInput';
import AttachedFilesList from '../AttachedFilesList';
import './ChatStartPage.css';

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
  // Voice recording props from parent (optional - will create own if not provided)
  isVoiceRecording: externalIsVoiceRecording,
  isVoiceProcessing: externalIsVoiceProcessing,
  startRecording: externalStartRecording,
  stopRecording: externalStopRecording,
  // File input props from parent (optional)
  fileInputRef: externalFileInputRef,
  handleFileUploadClick: externalHandleFileUploadClick,
  handleFileChange: externalHandleFileChange
}) => {
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

  // File input - use external if provided
  const internalFileInputRef = useRef(null);
  const fileInputRef = externalFileInputRef || internalFileInputRef;

  const handleFileUploadClick = useCallback(() => {
    if (externalHandleFileUploadClick) {
      externalHandleFileUploadClick();
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [externalHandleFileUploadClick, fileInputRef]);

  const handleFileChange = useCallback((event) => {
    if (externalHandleFileChange) {
      externalHandleFileChange(event);
    } else {
      const files = Array.from(event.target.files);
      if (files.length > 0 && onFileSelect) {
        onFileSelect(files);
      }
      event.target.value = '';
    }
  }, [externalHandleFileChange, onFileSelect]);

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

  const hasText = (inputValue || '').trim();
  const effectiveSubmitLabel = hasText
    ? <BsArrowUpCircleFill size={20} />
    : (isVoiceRecording ? <FaStop size={18} /> : <FaMicrophone size={18} />);

  const handleButtonClick = () => {
    if (hasText) {
      handleSubmit({ preventDefault: () => {} });
    } else if (isVoiceRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleExampleClick = (text) => {
    onInputChange && onInputChange(text);
  };

  return (
    <motion.div
      className="chat-start-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="chat-start-page-content">
        <motion.h1
          className="chat-start-page-title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {title}
        </motion.h1>

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
              {enableFileUpload && (
                <>
                  <button
                    type="button"
                    className="chat-start-page-file-button"
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
                className={`chat-start-page-submit-button ${isVoiceRecording ? 'voice-recording' : ''}`}
              >
                {effectiveSubmitLabel}
              </button>
            </div>
          </div>
        </motion.form>

        {exampleQuestions.length > 0 && (
          <motion.div
            className="chat-start-page-examples"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
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
  // Voice recording props from parent (optional)
  isVoiceRecording: PropTypes.bool,
  isVoiceProcessing: PropTypes.bool,
  startRecording: PropTypes.func,
  stopRecording: PropTypes.func,
  // File input props from parent (optional)
  fileInputRef: PropTypes.object,
  handleFileUploadClick: PropTypes.func,
  handleFileChange: PropTypes.func
};

export default ChatStartPage;
