import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const AvatarSelectionModal = ({ isOpen, onClose, currentAvatarId, onSelect }) => {
  const [selectedId, setSelectedId] = useState(currentAvatarId);
  const shouldReduceMotion = useReducedMotion();

  const robotIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  useEffect(() => {
    setSelectedId(currentAvatarId);
  }, [currentAvatarId]);

  // Body scroll lock effect
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Get scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleSelect = (robotId) => {
    setSelectedId(robotId);
    onSelect(robotId);

    // Auto-close modal after short delay
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleKeyDown = (event, robotId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(robotId);
    }
  };

  const modalVariants = shouldReduceMotion
    ? {
        closed: { opacity: 0 },
        open: { opacity: 1 }
      }
    : {
        closed: { opacity: 0, scale: 0.95 },
        open: { opacity: 1, scale: 1 }
      };

  const gridVariants = shouldReduceMotion
    ? {}
    : {
        open: {
          transition: {
            staggerChildren: 0.03,
            delayChildren: 0.05
          }
        }
      };

  const itemVariants = shouldReduceMotion
    ? {
        closed: { opacity: 0 },
        open: { opacity: 1 }
      }
    : {
        closed: { opacity: 0, y: 8 },
        open: { opacity: 1, y: 0 }
      };

  const modalContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="avatar-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-modal-title"
        >
          <motion.div
            className="avatar-modal-content"
            variants={modalVariants}
            initial="closed"
            animate="open"
            exit="closed"
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="avatar-modal-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 id="avatar-modal-title">Wähle deinen Avatar</h3>
              <button
                className="avatar-modal-close-button"
                onClick={onClose}
                aria-label="Modal schließen"
                type="button"
              >
                ✕
              </button>
            </motion.div>

            <motion.div
              className="avatar-grid"
              variants={gridVariants}
              initial="closed"
              animate="open"
            >
              {robotIds.map((robotId) => (
                <motion.button
                  key={robotId}
                  className={`avatar-option ${selectedId === robotId ? 'selected' : ''}`}
                  variants={itemVariants}
                  whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.995 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  onClick={() => handleSelect(robotId)}
                  onKeyDown={(e) => handleKeyDown(e, robotId)}
                  aria-label={`Roboter Avatar ${robotId} auswählen`}
                  type="button"
                  tabIndex={0}
                >
                  <div className="avatar-option-image">
                    <img
                      src={`/images/profileimages/${robotId}.svg`}
                      alt={`Roboter Avatar ${robotId}`}
                      loading="lazy"
                    />
                  </div>
                  {selectedId === robotId && (
                    <motion.div
                      className="avatar-option-checkmark"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                      ✓
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </motion.div>

            <motion.div
              className="avatar-modal-footer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="avatar-modal-hint">Klicke auf einen Roboter, um ihn auszuwählen</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render modal using React Portal to ensure it's on top
  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
};

export default AvatarSelectionModal;
