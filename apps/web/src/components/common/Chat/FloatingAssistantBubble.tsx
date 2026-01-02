import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AssistantIcon } from '../../../config/icons';
import TypingIndicator from '../UI/TypingIndicator';
import ChatActionButtons from './ChatActionButtons';
import './FloatingAssistantBubble.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const AUTO_DISMISS_TIMEOUT = 8000;
const PREVIEW_LENGTH = 50;

interface FloatingAssistantBubbleProps {
  message?: {
    type?: string;
    content?: string;
    timestamp?: number;
    actions?: unknown[]
  };
  onDismiss: () => void;
  onActionClick?: () => void;
  autoDismissTimeout?: number;
  isProcessing?: boolean;
}

const FloatingAssistantBubble = ({ message,
  onDismiss,
  onActionClick,
  autoDismissTimeout = AUTO_DISMISS_TIMEOUT,
  isProcessing = false }: FloatingAssistantBubbleProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const autoDismissTimerRef = useRef(null);
  const bubbleRef = useRef(null);

  const startAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
    }
    autoDismissTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, autoDismissTimeout);
  }, [autoDismissTimeout, onDismiss]);

  useEffect(() => {
    startAutoDismissTimer();
    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, [startAutoDismissTimer]);

  const handleToggleExpand = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
      startAutoDismissTimer();
    }
  }, [isExpanded, startAutoDismissTimer]);

  const handleDismiss = useCallback((e) => {
    e?.stopPropagation();
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      handleDismiss();
    } else if ((e.key === 'Enter' || e.key === ' ') && !isExpanded) {
      e.preventDefault();
      handleToggleExpand();
    }
  }, [handleDismiss, handleToggleExpand, isExpanded]);

  const previewText = message?.content
    ? message.content.slice(0, PREVIEW_LENGTH) +
      (message.content.length > PREVIEW_LENGTH ? '...' : '')
    : '';

  const bubbleVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -5, scale: 0.98 }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={bubbleRef}
          className={`floating-assistant-bubble ${isExpanded ? 'expanded' : 'collapsed'}`}
          variants={bubbleVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
          onClick={!isExpanded ? handleToggleExpand : undefined}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="alert"
          aria-live="polite"
          aria-expanded={isExpanded}
          aria-label="Assistenten-Nachricht"
        >
          <div className="floating-assistant-bubble-header">
            <div className="floating-assistant-bubble-icon">
              <AssistantIcon />
            </div>

            {!isExpanded && (
              <span className="floating-assistant-bubble-preview">
                {isProcessing ? <TypingIndicator /> : previewText}
              </span>
            )}

            {isExpanded && (
              <button
                className="floating-assistant-bubble-close"
                onClick={handleDismiss}
                aria-label="Nachricht schliessen"
              >
                &times;
              </button>
            )}
          </div>

          {isExpanded && message && (
            <motion.div
              className="floating-assistant-bubble-content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div>Loading...</div>}>
                <ReactMarkdown
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    )
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </Suspense>

              {message.actions && message.actions.length > 0 && (
                <ChatActionButtons
                  actions={message.actions}
                  onAction={onActionClick}
                  disabled={isProcessing}
                />
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingAssistantBubble;
