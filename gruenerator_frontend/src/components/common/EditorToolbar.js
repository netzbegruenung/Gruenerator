import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from 'react-icons/hi';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { FormContext } from '../utils/FormContext';
import CustomContextMenu from './CustomContextMenu';
import { useMediaQuery } from 'react-responsive';

const CustomUndo = React.memo(() => {
  console.log('CustomUndo-Komponente gerendert');
  return (
    <button className="ql-undo custom-button" data-label="Undo" aria-label="Undo">
      <FaUndo />
    </button>
  );
});
CustomUndo.displayName = "CustomUndo";

const CustomRedo = React.memo(() => {
  console.log('CustomRedo-Komponente gerendert');
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
}) => {
  const { adjustText, error, setError, isApplyingAdjustment } = useContext(FormContext);

  console.log('EditorToolbarComponent gerendert', { isAdjusting, showAdjustButton, selectedText });

  const [adjustmentText, setAdjustmentText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const adjustContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialClickRef = useRef(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      console.log('Escape-Taste gedrückt');
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
      console.log('Kein Text ausgewählt oder kein Anpassungstext eingegeben');
      return;
    }

    setIsProcessingAdjustment(true);
    try {
      console.log('Sende Anpassungsanfrage:', { adjustmentText, textToAdjust });
      const result = await adjustText(adjustmentText, textToAdjust);
      console.log('Ergebnis der Anpassung:', result);
      if (result) {
        await onAiAdjustment(result);
        setShowConfirmation(true);
      } else {
        console.error('Keine Vorschläge von der API erhalten');
      }
    } catch (error) {
      console.error('Fehler bei der Textanpassung:', error);
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

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      let x = e.clientX;
      let y = e.clientY;

      if (window.innerHeight - rect.bottom > 100) {
        y = rect.bottom + window.scrollY;
      } else {
        y = rect.top + window.scrollY - 40;
      }

      if (x + 200 > window.innerWidth) {
        x = window.innerWidth - 220;
      }

      setMenuPosition({ x, y });
      setShowCustomMenu(true);
    }
  }, []);

  const handleCloseCustomMenu = useCallback(() => {
    setShowCustomMenu(false);
  }, []);

  const handleCustomMenuClick = useCallback((e) => {
    e.stopPropagation();
    handleAdjustClick(e);
    setShowCustomMenu(false);
  }, [handleAdjustClick]);

  useEffect(() => {
    const editorElement = document.querySelector('.ql-editor');
    if (editorElement) {
      editorElement.addEventListener('contextmenu', handleContextMenu);
    }
    return () => {
      if (editorElement) {
        editorElement.removeEventListener('contextmenu', handleContextMenu);
      }
    };
  }, [handleContextMenu]);

  useEffect(() => {
    console.log('EditorToolbar: isAdjusting changed:', isAdjusting);
  }, [isAdjusting]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isInitialClickRef.current) {
        isInitialClickRef.current = false;
        return;
      }
      setTimeout(() => {
        if (adjustContainerRef.current && !adjustContainerRef.current.contains(event.target)) {
          console.log('Klick außerhalb des Anpassungsbereichs');
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
      console.log('Fokus auf Eingabefeld gesetzt');
      inputRef.current.focus();
    }
  }, [isAdjusting]);

  useEffect(() => {
    if (error) {
      // Zeigen Sie eine Fehlermeldung an oder führen Sie andere Aktionen durch
      console.error('Fehler bei der Textanpassung:', error);
      // Setzen Sie den Fehlerzustand nach einer Weile zurück
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
                          console.log('Anpassungstext geändert:', e.target.value);
                          setAdjustmentText(e.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Verbesserungsvorschlag"
                        className="adjust-input"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          console.log('Anpassung abgebrochen');
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
      {!isMobile && showCustomMenu && (
        <CustomContextMenu
          position={menuPosition}
          onClose={handleCloseCustomMenu}
          onAdjustClick={handleCustomMenuClick}
        />
      )}
    </div>
  );
};

EditorToolbarComponent.propTypes = {
  showAdjustButton: PropTypes.bool.isRequired,
  selectedText: PropTypes.string.isRequired,
  isAdjusting: PropTypes.bool.isRequired,
  onConfirmAdjustment: PropTypes.func.isRequired,
  quillRef: PropTypes.object.isRequired,
  highlightedRange: PropTypes.shape({
    index: PropTypes.number.isRequired,
    length: PropTypes.number.isRequired,
  }),
  onAiAdjustment: PropTypes.func.isRequired,
  originalSelectedText: PropTypes.string.isRequired,
  onRejectAdjustment: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
};

EditorToolbarComponent.defaultProps = {
  highlightedRange: null,
};

export const EditorToolbar = React.memo(EditorToolbarComponent);
