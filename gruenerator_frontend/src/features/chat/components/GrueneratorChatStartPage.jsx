import React, { useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { BsArrowUpCircleFill } from 'react-icons/bs';
import { FaMicrophone, FaStop, FaPlus } from 'react-icons/fa';
import useChatInput from '../../../components/common/Chat/hooks/useChatInput';
import AttachedFilesList from '../../../components/common/AttachedFilesList';
import './GrueneratorChatStartPage.css';

const GrueneratorChatStartPage = ({
  title = "Was kann ich für dich tun?",
  placeholder = "Beschreib mir kurz, was du brauchst...",
  inputValue = "",
  onInputChange,
  onSubmit,
  disabled = false,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile,
  exampleQuestions = [],
  isVoiceRecording: externalIsVoiceRecording,
  isVoiceProcessing: externalIsVoiceProcessing,
  startRecording: externalStartRecording,
  stopRecording: externalStopRecording,
  fileInputRef: externalFileInputRef,
  handleFileUploadClick: externalHandleFileUploadClick,
  handleFileChange: externalHandleFileChange
}) => {
  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice: false,
    enableVoiceRecording: !hasExternalVoice,
    onFileSelect
  });

  const isVoiceRecording = hasExternalVoice ? externalIsVoiceRecording : internalChatInput.isVoiceRecording;
  const isVoiceProcessing = hasExternalVoice ? externalIsVoiceProcessing : internalChatInput.isVoiceProcessing;
  const startRecording = hasExternalVoice ? externalStartRecording : internalChatInput.startRecording;
  const stopRecording = hasExternalVoice ? externalStopRecording : internalChatInput.stopRecording;

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
      className="gruenerator-chat-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="gruenerator-chat-start__input-section">
        <motion.h2
          className="gruenerator-chat-start__title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {title}
        </motion.h2>

        <motion.form
          className="gruenerator-chat-start__form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="gruenerator-chat-start__input-container">
            {enableFileUpload && attachedFiles.length > 0 && (
              <AttachedFilesList
                files={attachedFiles}
                onRemoveFile={onRemoveFile}
                className="gruenerator-chat-start__attached-files"
              />
            )}
            <textarea
              value={inputValue}
              onChange={(event) => onInputChange && onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="gruenerator-chat-start__input"
            />
            <div className="gruenerator-chat-start__buttons">
              {enableFileUpload && (
                <>
                  <button
                    type="button"
                    className="gruenerator-chat-start__file-button"
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
                className={`gruenerator-chat-start__submit-button ${isVoiceRecording ? 'voice-recording' : ''}`}
              >
                {effectiveSubmitLabel}
              </button>
            </div>
          </div>
        </motion.form>

        {exampleQuestions.length > 0 && (
          <motion.div
            className="gruenerator-chat-start__examples"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="gruenerator-chat-start__example"
                onClick={() => handleExampleClick(question.text)}
              >
                <span>{question.icon}</span>
                <span>{question.text}</span>
              </button>
            ))}
          </motion.div>
        )}
      </div>

      <motion.div
        className="gruenerator-chat-start__features"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <div className="gruenerator-chat-start__feature">
          <h3>Vielfältige Textformate</h3>
          <p>Von Social-Media-Posts über Pressemitteilungen bis zu Anträgen – ich finde den passenden Stil automatisch.</p>
        </div>
        <div className="gruenerator-chat-start__feature">
          <h3>Sharepics inklusive</h3>
          <p>Direkt nutzbare Sharepics mit passenden Headlines, Farben und Varianten – inklusive Download.</p>
        </div>
        <div className="gruenerator-chat-start__feature">
          <h3>Mehrere Ergebnisse</h3>
          <p>Ich kann mehrere Antworten gleichzeitig liefern, z.&nbsp;B. Textvorschlag und Sharepic auf einen Streich.</p>
        </div>
      </motion.div>

      <motion.div
        className="gruenerator-chat-start__tip"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <span className="gruenerator-chat-start__tip-label">Tipp</span>
        <p>Starte z.&nbsp;B. mit: „Schreib einen Instagram-Post über Solarenergie"</p>
      </motion.div>
    </motion.div>
  );
};

GrueneratorChatStartPage.propTypes = {
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
  isVoiceRecording: PropTypes.bool,
  isVoiceProcessing: PropTypes.bool,
  startRecording: PropTypes.func,
  stopRecording: PropTypes.func,
  fileInputRef: PropTypes.object,
  handleFileUploadClick: PropTypes.func,
  handleFileChange: PropTypes.func
};

export default GrueneratorChatStartPage;
