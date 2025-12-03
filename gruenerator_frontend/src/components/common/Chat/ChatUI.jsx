import React, { lazy, Suspense, useRef, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'motion/react';
import { FaMicrophone, FaStop, FaPlus } from 'react-icons/fa';
import { AssistantIcon } from '../../../config/icons';
import './ChatUI.css';
const ReactMarkdown = lazy(() => import('react-markdown'));
import TypingIndicator from '../UI/TypingIndicator';
import useVoiceRecorder from '../../../features/voice/hooks/useVoiceRecorder';
import AttachedFilesList from '../AttachedFilesList';
import ChatActionButtons from './ChatActionButtons';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';

const ChatUI = ({
  messages = [],
  onSubmit,
  isProcessing = false,
  placeholder = "Nachricht eingeben...",
  inputValue = "",
  onInputChange,
  disabled = false,
  renderInput,
  renderMessage,
  children,
  className = "",
  fullScreen = false,
  showHeader = true,
  headerTitle = "Chat",
  onClose,
  onVoiceRecorderTranscription,
  autoSubmitVoice = true,
  enableFileUpload = false,
  onFileSelect,
  attachedFiles = [],
  onRemoveFile,
  singleLine = false
}) => {
  const chatContainerRef = useRef(null);
  const lastMessageIndexRef = useRef(0);
  const scrollTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  const { user } = useOptimizedAuth();
  const { data: profile } = useProfile(user?.id);

  const avatarRobotId = profile?.avatar_robot_id ?? 1;
  const displayName = profile?.display_name || '';

  const userAvatarProps = useMemo(() => {
    const props = getAvatarDisplayProps({
      avatar_robot_id: avatarRobotId,
      display_name: displayName,
      email: user?.email
    });
    console.log('[ChatUI] userAvatarProps:', props, 'profile:', profile, 'avatarRobotId:', avatarRobotId);
    return props;
  }, [avatarRobotId, displayName, user?.email, profile]);

  const voiceRecorderHook = useVoiceRecorder((text) => {
    handleVoiceRecorderTranscription(text);
  }, { removeTimestamps: true });

  const {
    isRecording: isVoiceRecording,
    isProcessing: isVoiceProcessing,
    startRecording,
    stopRecording,
    processRecording
  } = voiceRecorderHook;

  // Auto-scroll behavior
  useEffect(() => {
    if (messages.length > lastMessageIndexRef.current) {
      const lastMessage = messages[messages.length - 1];
      
      if ((lastMessage.type === 'assistant' || lastMessage.type === 'error' || lastMessage.type === 'user') && messages.length > 2) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        scrollTimeoutRef.current = setTimeout(() => {
          const messageElements = chatContainerRef.current?.querySelectorAll('.chat-message');
          if (messageElements && messageElements.length > 0) {
            const lastElement = messageElements[messageElements.length - 1];
            lastElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end'
            });
          }
          scrollTimeoutRef.current = null;
        }, 350);
      }
    }
    
    lastMessageIndexRef.current = messages.length;
  }, [messages]);

  // Scroll to bottom on initial load and processing state changes
  useEffect(() => {
    if (chatContainerRef.current) {
      const timeoutId = setTimeout(() => {
        if(chatContainerRef.current) {
          const { scrollHeight, clientHeight } = chatContainerRef.current;
          chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, isProcessing]);

  // Process recording for transcription when recording stops
  useEffect(() => {
    if (!isVoiceRecording) {
      processRecording();
    }
  }, [isVoiceRecording, processRecording]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || disabled) return;
    onSubmit && onSubmit(inputValue);
  };

  const defaultRenderMessage = (msg, index) => {
    return (
      <motion.div
        key={msg.timestamp || index}
        className={`chat-message ${msg.type}`}
        initial={{ opacity: 0, y: 2, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
      >
        {msg.type === 'user' && msg.userName && (
          <div className="chat-message-user-name">{msg.userName}</div>
        )}
        {msg.type === 'assistant' && (
          userAvatarProps.type === 'robot' ? (
            <div className="assistant-icon-wrapper">
              <img
                src={userAvatarProps.src}
                alt={userAvatarProps.alt}
                className="assistant-icon assistant-robot-image"
              />
            </div>
          ) : (
            <AssistantIcon className="assistant-icon" />
          )
        )}

        {msg.quotedText && (
          <div className="chat-message-quote">
            „{msg.quotedText}"
          </div>
        )}

        <Suspense fallback={<div>Loading...</div>}><ReactMarkdown
          components={{
            // eslint-disable-next-line react/prop-types
            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
          }}
        >
          {msg.content}
        </ReactMarkdown></Suspense>

        {msg.attachments && msg.attachments.length > 0 && (
          <div className="chat-message-attachments">
            {msg.attachments.map((att, i) => (
              <span key={i} className="chat-message-attachment">
                {att.type?.startsWith('image/') ? '🖼️' : '📎'} {att.name}
              </span>
            ))}
          </div>
        )}

        {msg.actions && msg.actions.length > 0 && (
          <ChatActionButtons
            actions={msg.actions}
            onAction={(action) => onSubmit && onSubmit(action.value)}
            disabled={isProcessing}
          />
        )}
      </motion.div>
    );
  };


  const handleVoiceRecorderTranscription = useCallback((text) => {
    if (!text) return;

    // Update the input field
    const newValue = inputValue ? `${inputValue} ${text}`.trim() : text;
    if (onInputChange) {
      onInputChange(newValue);
    }

    // Auto-submit if enabled
    if (autoSubmitVoice && onSubmit) {
      console.log('[ChatUI] Auto-submitting voice transcription:', newValue);
      // Small delay to show the text in input first
      setTimeout(() => {
        onSubmit(newValue);
        // Clear input after submit
        if (onInputChange) {
          onInputChange('');
        }
      }, 100);
    }

    onVoiceRecorderTranscription && onVoiceRecorderTranscription(text);
  }, [inputValue, onInputChange, onSubmit, onVoiceRecorderTranscription, autoSubmitVoice]);

  const handleFileUploadClick = useCallback(() => {
    console.log('[ChatUI] File upload button clicked');
    if (fileInputRef.current) {
      console.log('[ChatUI] Triggering file input click');
      fileInputRef.current.click();
    } else {
      console.warn('[ChatUI] File input ref not found');
    }
  }, []);

  const handleFileChange = useCallback((event) => {
    const files = Array.from(event.target.files);
    console.log('[ChatUI] File input changed:', files.length, 'files selected');

    if (files.length > 0 && onFileSelect) {
      console.log('[ChatUI] Calling onFileSelect with files:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
      onFileSelect(files);
    } else {
      console.warn('[ChatUI] No files selected or onFileSelect not available');
    }
    // Reset file input to allow selecting the same file again
    event.target.value = '';
  }, [onFileSelect]);


  const defaultRenderInput = () => (
    <>
      <div className="floating-input">
        {enableFileUpload && attachedFiles.length > 0 && (
          <AttachedFilesList
            files={attachedFiles}
            onRemoveFile={onRemoveFile}
            className="chat-attached-files"
          />
        )}
        <div className="input-elements">
          {singleLine ? (
            <input
              type="text"
              className="form-input"
              value={inputValue}
              onChange={(e) => onInputChange && onInputChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
          ) : (
            <textarea
              className="form-input"
              value={inputValue}
              onChange={(e) => onInputChange && onInputChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
          )}
          <div className="chat-input-buttons">
            {enableFileUpload && (
              <>
                <button
                  type="button"
                  className="chat-file-upload-button"
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
              type="button"
              className={`chat-send-button ${isVoiceRecording ? 'voice-recording' : ''}`}
              onClick={inputValue.trim() ? handleSubmit : (isVoiceRecording ? stopRecording : startRecording)}
              disabled={disabled || isVoiceProcessing}
            >
              {isVoiceRecording ? (
                <FaStop />
              ) : inputValue.trim() ? (
                '➤'
              ) : (
                <FaMicrophone />
              )}
            </button>
          </div>
        </div>
      </div>
      <span className="floating-input-warning">
        kann Fehler machen. Überprüfe wichtige Informationen
      </span>
    </>
  );

  return (
    <div className={className}>
      {showHeader && (
        <div className="chat-header">
          <h3>{headerTitle}</h3>
          {onClose && (
            <button className="close-button" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      )}
      <div className={`chat-messages markdown-styles ${fullScreen ? 'chat-messages-fullscreen' : ''}`} ref={chatContainerRef}>
        <AnimatePresence initial={true}>
          {messages.map((msg, index) => 
            renderMessage ? renderMessage(msg, index) : defaultRenderMessage(msg, index)
          )}
          
          {isProcessing && (
            <motion.div
              key="typing-indicator"
              className="chat-message assistant"
              initial={{ opacity: 0, y: 3, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15, ease: "easeOut" } }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
            >
              {userAvatarProps.type === 'robot' ? (
                <div className="assistant-icon-wrapper">
                  <img
                    src={userAvatarProps.src}
                    alt={userAvatarProps.alt}
                    className="assistant-icon assistant-robot-image"
                  />
                </div>
              ) : (
                <AssistantIcon className="assistant-icon" />
              )}
              <TypingIndicator />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {children}
      
      <div className={`chat-input-area ${fullScreen ? 'chat-input-area-fullscreen' : ''}`}>
        {renderInput ? renderInput() : defaultRenderInput()}
      </div>
    </div>
  );
};

ChatUI.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.oneOf(['user', 'assistant', 'error']).isRequired,
    content: PropTypes.string.isRequired,
    timestamp: PropTypes.number,
    userName: PropTypes.string,
    quotedText: PropTypes.string
  })),
  onSubmit: PropTypes.func,
  isProcessing: PropTypes.bool,
  placeholder: PropTypes.string,
  inputValue: PropTypes.string,
  onInputChange: PropTypes.func,
  disabled: PropTypes.bool,
  renderInput: PropTypes.func,
  renderMessage: PropTypes.func,
  children: PropTypes.node,
  className: PropTypes.string,
  fullScreen: PropTypes.bool,
  showHeader: PropTypes.bool,
  headerTitle: PropTypes.string,
  onClose: PropTypes.func,
  onVoiceRecorderTranscription: PropTypes.func,
  enableFileUpload: PropTypes.bool,
  onFileSelect: PropTypes.func,
  attachedFiles: PropTypes.array,
  onRemoveFile: PropTypes.func,
  singleLine: PropTypes.bool
};

export default ChatUI;
