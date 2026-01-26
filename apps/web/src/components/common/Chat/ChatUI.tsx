import { motion, AnimatePresence } from 'motion/react';
import { type JSX, useRef, useEffect, useMemo, FormEvent, type ReactNode } from 'react';

import './ChatUI.css';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import AttachedFilesList from '../AttachedFilesList';
import { Markdown } from '../Markdown';
import TypingIndicator from '../UI/TypingIndicator';

import AssistantAvatar from './AssistantAvatar';
import ChatActionButtons from './ChatActionButtons';
import ChatFileUploadButton from './ChatFileUploadButton';
import ChatSubmitButton from './ChatSubmitButton';
import useChatInput from './hooks/useChatInput';

interface ChatMessage {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp?: number;
  userName?: string;
  quotedText?: string;
  attachments?: Array<{ type?: string; name: string }>;
  actions?: Array<{ value: string; label?: string }>;
}

interface AttachedFile {
  name: string;
  type?: string;
  size?: number;
}

interface ChatUIProps {
  messages: ChatMessage[];
  onSubmit?: (value: string | React.FormEvent) => void;
  isProcessing?: boolean;
  placeholder?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  disabled?: boolean;
  renderInput?: () => ReactNode;
  renderMessage?: (message: ChatMessage, index: number) => ReactNode;
  children?: ReactNode;
  className?: string;
  fullScreen?: boolean;
  showHeader?: boolean;
  headerTitle?: string;
  onClose?: () => void;
  onVoiceRecorderTranscription?: (text: string) => void;
  autoSubmitVoice?: boolean;
  enableFileUpload?: boolean;
  onFileSelect?: (files: File[]) => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  singleLine?: boolean;
  // Voice recording props from parent (optional)
  isVoiceRecording?: boolean;
  isVoiceProcessing?: boolean;
  startRecording?: () => void;
  stopRecording?: () => void;
}

const ChatUI = ({
  messages = [],
  onSubmit,
  isProcessing = false,
  placeholder = 'Nachricht eingeben...',
  inputValue = '',
  onInputChange,
  disabled = false,
  renderInput,
  renderMessage,
  children,
  className = '',
  fullScreen = false,
  showHeader = true,
  headerTitle = 'Chat',
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
  stopRecording: externalStopRecording,
}: ChatUIProps): JSX.Element => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageIndexRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user } = useOptimizedAuth();
  const { data: profile } = useProfile(user?.id) as {
    data: { avatar_robot_id?: number; display_name?: string } | null;
  };

  const avatarRobotId = profile?.avatar_robot_id ?? 1;
  const displayName = profile?.display_name || '';

  const userAvatarProps = useMemo(() => {
    const props = getAvatarDisplayProps({
      avatar_robot_id: avatarRobotId,
      display_name: displayName,
      email: user?.email,
    });
    return props;
  }, [avatarRobotId, displayName, user?.email]);

  // Use internal hook only if voice props not provided from parent
  const hasExternalVoice = externalStartRecording !== undefined;

  const internalChatInput = useChatInput({
    inputValue,
    onInputChange,
    onSubmit,
    autoSubmitVoice,
    enableVoiceRecording: !hasExternalVoice,
    onVoiceTranscription: onVoiceRecorderTranscription,
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

  // Auto-scroll behavior
  useEffect(() => {
    if (messages.length > lastMessageIndexRef.current) {
      const lastMessage = messages[messages.length - 1];

      if (
        (lastMessage.type === 'assistant' ||
          lastMessage.type === 'error' ||
          lastMessage.type === 'user') &&
        messages.length > 2
      ) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
          const messageElements = chatContainerRef.current?.querySelectorAll('.chat-message');
          if (messageElements && messageElements.length > 0) {
            const lastElement = messageElements[messageElements.length - 1];
            lastElement.scrollIntoView({
              behavior: 'smooth',
              block: 'end',
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
        if (chatContainerRef.current) {
          const { scrollHeight, clientHeight } = chatContainerRef.current;
          chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || disabled) return;
    onSubmit?.(inputValue);
  };

  const defaultRenderMessage = (msg: ChatMessage, index: number) => {
    return (
      <motion.div
        key={msg.timestamp || index}
        className={`chat-message ${msg.type}`}
        initial={{ opacity: 0, y: 2, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: 'easeOut' } }}
        transition={{ type: 'tween', ease: 'easeOut', duration: 0.35 }}
      >
        {msg.type === 'user' && msg.userName && (
          <div className="chat-message-user-name">{msg.userName}</div>
        )}
        {msg.type === 'assistant' && <AssistantAvatar avatarProps={userAvatarProps} />}

        {msg.quotedText && <div className="chat-message-quote">„{msg.quotedText}"</div>}

        <Markdown>{msg.content}</Markdown>

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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onInputChange && onInputChange(e.target.value)
              }
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e: React.KeyboardEvent) => {
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
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onInputChange && onInputChange(e.target.value)
              }
              placeholder={placeholder}
              disabled={disabled}
              onKeyDown={(e: React.KeyboardEvent) => {
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
      <div
        className={`chat-messages markdown-styles ${fullScreen ? 'chat-messages-fullscreen' : ''}`}
        ref={chatContainerRef}
      >
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
              exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.15, ease: 'easeOut' } }}
              transition={{ type: 'tween', ease: 'easeOut', duration: 0.25 }}
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

export default ChatUI;
