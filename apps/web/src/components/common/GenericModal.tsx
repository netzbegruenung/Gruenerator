import { motion, AnimatePresence } from 'motion/react';
import React, { type ReactNode } from 'react';

import Icon from './Icon';
import './generic-modal.css';

interface GenericModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  className?: string;
}

const GenericModal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  className = '',
}: GenericModalProps) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className={`generic-modal-overlay ${className}`} onClick={onClose}>
        <motion.div
          className={`generic-modal-container ${size}`}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="generic-modal-header">
            {title && <h2 className="generic-modal-title">{title}</h2>}
            <button className="generic-modal-close" onClick={onClose} aria-label="Schließen">
              <Icon name="close" category="actions" />
            </button>
          </div>
          <div className="generic-modal-body">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GenericModal;
