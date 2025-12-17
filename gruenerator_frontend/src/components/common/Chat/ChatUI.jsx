import React, { lazy, Suspense, useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'motion/react';
import './ChatUI.css';
const ReactMarkdown = lazy(() => import('react-markdown'));
import TypingIndicator from '../UI/TypingIndicator';
import useChatInput from './hooks/useChatInput';
import AttachedFilesList from '../AttachedFilesList';
import ChatActionButtons from './ChatActionButtons';
import ChatSubmitButton from './ChatSubmitButton';
import ChatFileUploadButton from './ChatFileUploadButton';
import AssistantAvatar from './AssistantAvatar';
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
  singleLine = false,
  // Voice recording props from parent (optional - will create own if not provided)
  isVoiceRecording: externalIsVoiceRecording,
  isVoiceProcessing: externalIsVoiceProcessing,
  startRecording: externalStartRecording,
  stopRecording: externalStopRecording
}) => {
  const chatContainerRef = useRef(null);
  const lastMessageIndexRef = useRef(0);
  const scrollTimeoutRef = useRef(null);

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
    return props;
  }, [avatarRobotId, displayName, user?.email, profile]);

  // Use internal hook only if voice props not provided from parent
  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice,
    enableVoiceRecording: !hasExternalVoice,
    onVoiceTranscription: onVoiceRecorderTranscription,
    onFileSelect
  });

  // Use external props if provided, otherwise use internal hook values
  const isVoiceRecording = hasExternalVoice ? externalIsVoiceRecording : internalChatInput.isVoiceRecording;
  const isVoiceProcessing = hasExternalVoice ? externalIsVoiceProcessing : internalChatInput.isVoiceProcessing;
  const startRecording = hasExternalVoice ? externalStartRecording : internalChatInput.startRecording;
  const stopRecording = hasExternalVoice ? externalStopRecording : internalChatInput.stopRecording;

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
          <AssistantAvatar avatarProps={userAvatarProps} />
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
            <ChatFileUploadButton
              enabled={enableFileUpload}
              disabled={disabled}
              onFileSelect={onFileSelect}
            />
            <ChatSubmitButton
              inputValue={inputValue}
              isVoiceRecording={isVoiceRecording}
              isVoiceProcessing={isVoiceProcessing}
              onSubmit={handleSubmit}
              startRecording={startRecording}
              stopRecording={stopRecording}
              disabled={disabled}
              submitIcon="➤"
              className="chat-send-button"
            />
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
              <AssistantAvatar avatarProps={userAvatarProps} />
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
  autoSubmitVoice: PropTypes.bool,
  enableFileUpload: PropTypes.bool,
  onFileSelect: PropTypes.func,
  attachedFiles: PropTypes.array,
  onRemoveFile: PropTypes.func,
  singleLine: PropTypes.bool,
  // Voice recording props from parent (optional)
  isVoiceRecording: PropTypes.bool,
  isVoiceProcessing: PropTypes.bool,
  startRecording: PropTypes.func,
  stopRecording: PropTypes.func
};

export default ChatUI;
