import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from 'react-icons/hi';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { FormContext } from '../utils/FormContext';

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
  const { adjustText, loading, error, setError } = useContext(FormContext);

  console.log('EditorToolbarComponent gerendert', { isAdjusting, showAdjustButton, selectedText });

  const [adjustmentText, setAdjustmentText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const adjustContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialClickRef = useRef(false);

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
    e.preventDefault(); // Verhindert, dass der Editor den Fokus verliert
    console.log('Adjust-Button geklickt, aktueller isAdjusting-Zustand:', isAdjusting);
    if (typeof onAiAdjustment === 'function') {
      onAiAdjustment(true, selectedText); // Übergeben Sie den ausgewählten Text
    }
  }, [onAiAdjustment, isAdjusting, selectedText]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const textToAdjust = selectedText || originalSelectedText || '';
    if (!textToAdjust.trim() || !adjustmentText.trim()) {
      console.log('Kein Text ausgewählt oder kein Anpassungstext eingegeben');
      return;
    }

    try {
      console.log('Sende Anpassungsanfrage:', { adjustmentText, textToAdjust });
      const result = await adjustText(adjustmentText, textToAdjust);
      console.log('Ergebnis der Anpassung:', result);
      if (result) {
        onAiAdjustment(result); // Dies wird den neuen Text grün markieren
        setShowConfirmation(true);
      } else {
        console.error('Keine Vorschläge von der API erhalten');
      }
    } catch (error) {
      console.error('Fehler bei der Textanpassung:', error);
      setError('Error adjusting text. Please try again.');
    }
  }, [selectedText, originalSelectedText, adjustmentText, adjustText, onAiAdjustment, setError]);

  const handleReject = useCallback(() => {
    onRejectAdjustment();
    setShowConfirmation(false);
    setAdjustmentText('');
  }, [onRejectAdjustment]);

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
        {(showAdjustButton || isAdjusting || showConfirmation) && (
          <span className={`ql-formats adjust-text-container ${isAdjusting ? 'adjusting' : ''}`}>
            {isAdjusting && (
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
                    placeholder="Improvement suggestion"
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
                <button type="submit" className={`adjust-submit ${loading ? 'loading' : ''}`} aria-label="Submit Adjustment" disabled={loading}>
  {loading ? (
    <HiCog className="loading-icon" />
  ) : (
    <span className="icon">➤</span>
  )}
</button>
              </form>
            )}
            {showConfirmation && (
              <div className="confirmation-buttons">
                <button 
                  onClick={() => {
                    onConfirmAdjustment(false); // false bedeutet, die Formatierung nicht beibehalten
                    setShowConfirmation(false);
                    setAdjustmentText('');
                  }} 
                  className="confirm-adjust" 
                  aria-label="Accept Adjustment"
                >
                  ✓
                </button>
                <button 
                  onClick={handleReject}
                  className="reject-adjust" 
                  aria-label="Reject Adjustment"
                >
                  ✗
                </button>
              </div>
            )}
            {!isAdjusting && !showConfirmation && showAdjustButton && selectedText && (
              <button
                className="ql-adjust-text custom-button"
                onClick={handleAdjustClick}
                aria-label="Adjust Text with AI"
              >
                <span className="adjust-content">
                  <HiCog size={16} className="adjust-icon" />
                  <span className="adjust-text">Adjust Text with AI</span>
                </span>
              </button>
            )}
          </span>
        )}
      </div>
      {error && <p className="error-message">Error: {error}</p>}
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
  newSelectedText: PropTypes.string,
  onRejectAdjustment: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
};

EditorToolbarComponent.defaultProps = {
  highlightedRange: null,
};

export const EditorToolbar = React.memo(EditorToolbarComponent);
