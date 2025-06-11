import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
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
  readOnly, 
  onAdjustText, 
  isAdjusting,
  showAdjustButton, 
  selectedText,
  isEditing,
  removeAllHighlights,
  originalContent
}) => {
  const { 
    adjustText, 
    error, 
    setError, 
    isApplyingAdjustment, 
    showConfirmationContainer,
    handleConfirmAdjustment 
  } = useContext(FormContext);

  const [adjustmentText, setAdjustmentText] = useState('');
  const adjustContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialClickRef = useRef(false);
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);

  const handleConfirm = useCallback(() => {
    handleConfirmAdjustment();
    setAdjustmentText('');
  }, [handleConfirmAdjustment]);

  useEffect(() => {
  }, [isAdjusting]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isInitialClickRef.current) {
        isInitialClickRef.current = false;
        return;
      }
      
    };

    if (isAdjusting) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isAdjusting]);

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
        {!isMobile && isAdjusting && (
          <span className="ql-formats adjust-text-container adjusting">
            {/* Bestätigungscontainer entfernt */}
          </span>
        )}
      </div>
      {!isMobile && error && <p className="error-message">Error: {error}</p>}
    </div>
  );
};

EditorToolbarComponent.propTypes = {
  readOnly: PropTypes.bool.isRequired,
  onAdjustText: PropTypes.func.isRequired,
  isAdjusting: PropTypes.bool.isRequired,
  showAdjustButton: PropTypes.bool.isRequired,
  selectedText: PropTypes.string.isRequired,
  isEditing: PropTypes.bool.isRequired,
  removeAllHighlights: PropTypes.func.isRequired,
  originalContent: PropTypes.string.isRequired
};

export const EditorToolbar = React.memo(EditorToolbarComponent);
