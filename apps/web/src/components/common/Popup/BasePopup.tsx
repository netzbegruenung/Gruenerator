import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { usePopupDismiss } from '../../../hooks/usePopupDismiss';
import { useAuthStore } from '../../../stores/authStore';
import Icon from '../Icon';
import './base-popup.css';

const IGNORED_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Tab',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

interface BasePopupProps {
  storageKey: string;
  children: ReactNode | ((props: { onClose: () => void }) => ReactNode);
  onClose?: () => void;
  variant?: 'default' | 'slider' | 'single';
  className?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  closeOnAnyKey?: boolean;
  requireAuth?: boolean;
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
  closeOnAnyKey = true,
  requireAuth = false,
}: BasePopupProps) => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');
  const isAuthRoute =
    location.pathname.startsWith('/profile') || location.pathname.startsWith('/login');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const { isDismissed, dismiss, isHydrated } = usePopupDismiss(storageKey);

  const [isVisible, setIsVisible] = useState(() => {
    if (isNoHeaderFooterRoute || isAuthRoute) return false;
    if (requireAuth && !isAuthenticated) return false;
    return !isDismissed;
  });

  // Hide popup if server state arrives and says dismissed (cross-device sync)
  useEffect(() => {
    if (isHydrated && isDismissed && isVisible) {
      setIsVisible(false);
    }
  }, [isHydrated, isDismissed, isVisible]);

  // Show popup when user logs in (if requireAuth and not yet dismissed)
  useEffect(() => {
    if (requireAuth && isAuthenticated && !isDismissed && !isNoHeaderFooterRoute && !isAuthRoute) {
      setIsVisible(true);
    }
  }, [requireAuth, isAuthenticated, isDismissed, isNoHeaderFooterRoute, isAuthRoute]);

  const handleClose = useCallback(() => {
    dismiss();
    setIsVisible(false);
    onClose?.();
  }, [dismiss, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      handleClose();
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    if (!closeOnEscape && !closeOnAnyKey) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (closeOnAnyKey && !IGNORED_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, closeOnEscape, closeOnAnyKey, handleClose]);

  if (!isVisible) return null;

  const variantClass =
    variant === 'slider'
      ? 'base-popup--slider'
      : variant === 'single'
        ? 'base-popup--single'
        : 'base-popup--default';

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
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {showCloseButton && (
            <button className="base-popup-close" onClick={handleClose} aria-label="Popup schließen">
              <Icon category="actions" name="close" />
            </button>
          )}

          {typeof children === 'function' ? children({ onClose: handleClose }) : children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BasePopup;
