import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../Icon';
import './base-popup.css';

interface BasePopupProps {
  storageKey: string;
  children: ReactNode | ((props: { onClose: () => void }) => ReactNode);
  onClose?: () => void;
  variant?: 'default' | 'slider' | 'single';
  className?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

const BasePopup = ({
  storageKey,
  children,
  onClose,
  variant = 'default',
  className = '',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: BasePopupProps) => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');
  const isAuthRoute = location.pathname.startsWith('/profile') || location.pathname.startsWith('/login');

  const [isVisible, setIsVisible] = useState(() => {
    if (isNoHeaderFooterRoute || isAuthRoute) return false;
    return !localStorage.getItem(storageKey);
  });

  const handleClose = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onClose?.();
  }, [storageKey, onClose]);

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      handleClose();
    }
  };

  useEffect(() => {
    if (!closeOnEscape || !isVisible) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, closeOnEscape, handleClose]);

  if (!isVisible) return null;

  const variantClass = variant === 'slider' ? 'base-popup--slider' : variant === 'single' ? 'base-popup--single' : 'base-popup--default';

  return (
    <AnimatePresence>
      <motion.div
        className={`base-popup-overlay ${variantClass} ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      >
        <motion.div
          className="base-popup-modal"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {showCloseButton && (
            <button
              className="base-popup-close"
              onClick={handleClose}
              aria-label="Popup schließen"
            >
              <Icon category="actions" name="close" />
            </button>
          )}

          {typeof children === 'function'
            ? children({ onClose: handleClose })
            : children
          }
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BasePopup;
