import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineTrash, HiExclamation } from 'react-icons/hi';

const DeleteWarningTooltip = ({
  onConfirm,
  disabled = false,
  title = "Löschen bestätigen",
  message = "Diese Aktion kann nicht rückgängig gemacht werden.",
  confirmText = "Endgültig löschen",
  cancelText = "Abbrechen",
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0: closed, 1: first warning, 2: final confirmation
  const [style, setStyle] = useState({ opacity: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      const space = 16; // Viewport edge margin

      // Start with right-aligned position (since delete button is in top right)
      let left = triggerRect.right + window.scrollX - tooltipRect.width;

      // Adjust if it overflows
      if (left < space) {
        left = space;
      }
      if (left + tooltipRect.width > windowWidth - space) {
        left = windowWidth - tooltipRect.width - space;
      }

      setStyle({
        position: 'absolute',
        top: `${triggerRect.bottom + window.scrollY + 4}px`,
        left: `${left}px`,
        opacity: 1,
        transition: 'opacity 0.15s ease-in',
      });
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(updatePosition, 0);
      document.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setStyle({ opacity: 0 });
      setConfirmStep(0);
    }
  }, [isVisible, updatePosition]);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (confirmStep === 0) {
      setConfirmStep(1);
      setIsVisible(true);
    }
  };

  const handleFirstConfirm = () => {
    setConfirmStep(2);
  };

  const handleFinalConfirm = () => {
    setIsVisible(false);
    setConfirmStep(0);
    onConfirm();
  };

  const handleCancel = () => {
    setIsVisible(false);
    setConfirmStep(0);
  };

  const handleClickOutside = useCallback((e) => {
    if (tooltipRef.current && !tooltipRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)) {
      handleCancel();
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, handleClickOutside]);

  return (
    <div className={`delete-warning-tooltip-container ${className}`}>
      <button
        ref={triggerRef}
        className="delete-warning-trigger"
        onClick={handleClick}
        disabled={disabled}
        type="button"
        title="Gruppe löschen"
        aria-label="Gruppe löschen"
      >
        <HiOutlineTrash />
      </button>
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className="delete-warning-tooltip-content"
          style={style}
        >
          <div className="delete-warning-arrow"></div>
          <div className="delete-warning-header">
            <HiExclamation className="delete-warning-icon" />
            <h4 className="delete-warning-title">{title}</h4>
          </div>

          {confirmStep === 1 && (
            <div className="delete-warning-body">
              <p className="delete-warning-message">{message}</p>
              <div className="delete-warning-actions">
                <button
                  className="delete-warning-button cancel"
                  onClick={handleCancel}
                  type="button"
                >
                  {cancelText}
                </button>
                <button
                  className="delete-warning-button confirm-first"
                  onClick={handleFirstConfirm}
                  type="button"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="delete-warning-body">
              <p className="delete-warning-message">
                <strong>Letzte Warnung:</strong> Diese Aktion löscht die gesamte Gruppe für alle Mitglieder unwiderruflich.
              </p>
              <div className="delete-warning-actions">
                <button
                  className="delete-warning-button cancel"
                  onClick={handleCancel}
                  type="button"
                >
                  {cancelText}
                </button>
                <button
                  className="delete-warning-button confirm-final"
                  onClick={handleFinalConfirm}
                  type="button"
                >
                  {confirmText}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default DeleteWarningTooltip;
