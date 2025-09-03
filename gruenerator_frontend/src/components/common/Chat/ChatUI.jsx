import React, { lazy, Suspense, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'motion/react';
import { HiChip } from "react-icons/hi";
const ReactMarkdown = lazy(() => import('react-markdown'));
import TypingIndicator from '../UI/TypingIndicator';

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
  fullScreen = false
}) => {
  const chatContainerRef = useRef(null);
  const lastMessageIndexRef = useRef(0);
  const scrollTimeoutRef = useRef(null);

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
        {msg.type === 'assistant' && <HiChip className="assistant-icon" />}
        
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
      </motion.div>
    );
  };

  const defaultRenderInput = () => (
    <>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange && onInputChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button 
        type="submit" 
        disabled={!inputValue.trim() || disabled}
      >
        ➤
      </button>
    </>
  );

  return (
    <div className={`editor-chat ${fullScreen ? 'editor-chat-fullscreen' : ''} ${className}`}>
      <div className={`editor-chat-messages markdown-styles ${fullScreen ? 'editor-chat-messages-fullscreen' : ''}`} ref={chatContainerRef}>
        <AnimatePresence initial={false}>
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
              <HiChip className="assistant-icon" />
              <TypingIndicator />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {children}
      
      <form 
        onSubmit={handleSubmit} 
        className="editor-chat-input"
      >
        {renderInput ? renderInput() : defaultRenderInput()}
      </form>
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
  fullScreen: PropTypes.bool
};

export default ChatUI;