import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from 'react-icons/hi';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { FormContext } from '../../utils/FormContext';
import { useMediaQuery } from 'react-responsive';

const CustomUndo = React.memo(() => {
  return (
    <button className="ql-undo custom-button" data-label="Undo" aria-label="Undo">
      <FaUndo />
    </button>
  );
});
CustomUndo.displayName = "CustomUndo";

const CustomRedo = React.memo(() => {
  return (
    <button className="ql-redo custom-button" data-label="Redo" aria-label="Redo">
      <FaRedo />
    </button>
  );
});
CustomRedo.displayName = "CustomRedo";

const EditorToolbarComponent = ({ 
  showAdjustButton, 
  selectedText, 
  isAdjusting,
  onConfirmAdjustment,
  onAiAdjustment,
  originalSelectedText,
  onRejectAdjustment,
  isEditing,
  showAdjustmentConfirmation = false,
}) => {
  const { adjustText, error, setError, isApplyingAdjustment } = useContext(FormContext);

  const [adjustmentText, setAdjustmentText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(showAdjustmentConfirmation);
  const adjustContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialClickRef = useRef(false);
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (typeof onAiAdjustment === 'function') {
        onAiAdjustment(false);
      }
      setAdjustmentText('');
    }
  }, [onAiAdjustment]);

  const handleAdjustClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    onAiAdjustment(true, selectedText);
  }, [onAiAdjustment, selectedText]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const textToAdjust = selectedText || originalSelectedText || '';
    if (!textToAdjust.trim() || !adjustmentText.trim()) {
      return;
    }

    setIsProcessingAdjustment(true);
    try {
      const result = await adjustText(adjustmentText, textToAdjust);
      if (result) {
        await onAiAdjustment(result);
        setShowConfirmation(true);
      } else {
        console.error('Keine Vorschläge von der API erhalten');
      }
    } catch (error) {
      setError('Error adjusting text. Please try again.');
    } finally {
      setIsProcessingAdjustment(false);
    }
  }, [selectedText, originalSelectedText, adjustmentText, adjustText, onAiAdjustment, setError]);

  const handleConfirmAdjustment = useCallback(() => {
    onConfirmAdjustment();
    setShowConfirmation(false);
    setAdjustmentText('');
    onAiAdjustment(false);
  }, [onConfirmAdjustment, onAiAdjustment]);

  useEffect(() => {
    setShowConfirmation(showAdjustmentConfirmation);
  }, [showAdjustmentConfirmation]);

  useEffect(() => {
  }, [isAdjusting]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isInitialClickRef.current) {
        isInitialClickRef.current = false;
        return;
      }
      setTimeout(() => {
        if (adjustContainerRef.current && !adjustContainerRef.current.contains(event.target)) {
          onAiAdjustment(false);
        }
      }, 100); // 100ms Verzögerung
    };

    if (isAdjusting) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isAdjusting, onAiAdjustment]);

  useEffect(() => {
    if (isAdjusting && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdjusting]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const isMobile = useMediaQuery({ maxWidth: 768 });

  return (
    <div className={`editor-toolbar-wrapper ${!isEditing ? 'read-only' : ''}`} ref={adjustContainerRef}>
      <div id="toolbar" className="ql-toolbar ql-snow">
        <span className="ql-formats">
          <button className="ql-bold" aria-label="Bold"></button>
          <button className="ql-italic" aria-label="Italic"></button>
          <button className="ql-underline" aria-label="Underline"></button>
        </span>
        <span className="ql-formats">
          <button className="ql-list" value="ordered" aria-label="Ordered List"></button>
          <button className="ql-list" value="bullet" aria-label="Bullet List"></button>
        </span>
        <span className="ql-formats">
          <CustomUndo />
          <CustomRedo />
        </span>
        {!isMobile && (showAdjustButton || isAdjusting || showConfirmation) && (
          <span className={`ql-formats adjust-text-container ${isAdjusting ? 'adjusting' : ''}`}>
            {isAdjusting && (
              <>
                {!showConfirmation && (
                  <form onSubmit={handleSubmit} className="adjust-form">
                    <div className="input-wrapper">
                      <input
                        ref={inputRef}
                        type="text"
                        value={adjustmentText}
                        onChange={(e) => {
                          setAdjustmentText(e.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Verbesserungsvorschlag"
                        className="adjust-input"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          onAiAdjustment(false);
                        }} 
                        className="cancel-adjust"
                        aria-label="Cancel Adjustment"
                      >
                        ×
                      </button>
                    </div>
                    <button type="submit" className={`adjust-submit ${isProcessingAdjustment ? 'loading' : ''}`} aria-label="Submit Adjustment" disabled={isProcessingAdjustment}>
                      {isProcessingAdjustment ? (
                        <HiCog className="loading-icon" />
                      ) : (
                        <span className="icon">➤</span>
                      )}
                    </button>
                  </form>
                )}
                {showConfirmation && (
                  <div className="confirmation-container">
                    <p>Anpassung annehmen?</p>
                    <div className="confirmation-buttons">
                      <button 
                        onClick={handleConfirmAdjustment} 
                        className="confirm-adjust" 
                        aria-label="Accept Adjustment"
                        disabled={isApplyingAdjustment}
                      >
                        {isApplyingAdjustment ? <HiCog className="loading-icon" /> : '✓'}
                      </button>
                      <button 
                        onClick={() => {
                          onRejectAdjustment();
                          setShowConfirmation(false);
                          setAdjustmentText('');
                          onAiAdjustment(false);
                        }}
                        className="reject-adjust" 
                        aria-label="Reject Adjustment"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {!isAdjusting && showAdjustButton && selectedText && (
              <button
                className="ql-adjust-text custom-button"
                onClick={handleAdjustClick}
                aria-label="Gruenerator AI-Anpassung"
              >
                <span className="adjust-content">
                  <HiCog size={16} className="adjust-icon" />
                  <span className="adjust-text">Grünerator AI-Anpassung</span>
                </span>
              </button>
            )}
          </span>
        )}
      </div>
      {!isMobile && error && <p className="error-message">Error: {error}</p>}
    </div>
  );
};

EditorToolbarComponent.propTypes = {
  showAdjustButton: PropTypes.bool.isRequired,
  selectedText: PropTypes.string.isRequired,
  isAdjusting: PropTypes.bool.isRequired,
  onConfirmAdjustment: PropTypes.func.isRequired,
  onAiAdjustment: PropTypes.func.isRequired,
  originalSelectedText: PropTypes.string.isRequired,
  onRejectAdjustment: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  showAdjustmentConfirmation: PropTypes.bool,
};

export const EditorToolbar = React.memo(EditorToolbarComponent);
