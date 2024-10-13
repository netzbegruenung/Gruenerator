import React, { useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import SubmitButton from './SubmitButton';
import useAccessibility from '../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import { BUTTON_LABELS, ARIA_LABELS, ANNOUNCEMENTS } from '../utils/constants';
import { IoCopyOutline, IoPencil, IoSaveOutline } from 'react-icons/io5';
import Editor from './Editor';
import SaveLinkModal from './SaveLinkModal';
import { copyPlainText } from '../utils/commonFunctions';
import 'react-quill/dist/quill.bubble.css';
import { FormContext } from '../utils/FormContext';

const BaseForm = ({
  title,
  children,
  onSubmit,
  loading,
  success,
  error,
  formErrors = {},
  onGeneratePost,
  generatedPost,
  allowEditing = true,
  initialContent = '',
}) => {
  console.log('BaseForm wird gerendert', { title, loading, success, error });

  const {
    value,
    isEditing,
    toggleEditMode,
    updateValue,
    saveCurrentContent,
    handleLoadContent,
    handleDeleteContent,
    savedLinks,
  } = useContext(FormContext);

  useEffect(() => {
    if (initialContent) {
      updateValue(initialContent);
    }
  }, [initialContent, updateValue]);

  const { announce, setupKeyboardNav } = useAccessibility();
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
  const [isSaveLinkModalOpen, setIsSaveLinkModalOpen] = useState(false);

  const handleGeneratePost = React.useCallback(async () => {
    console.log('Beitrag wird generiert');
    setGeneratePostLoading(true);
    announce(ANNOUNCEMENTS.GENERATING_TEXT);
    try {
      await onGeneratePost();
      console.log('Beitrag erfolgreich generiert');
      announce(ANNOUNCEMENTS.TEXT_GENERATED);
    } catch (error) {
      console.error('Fehler beim Generieren des Textes:', error);
      announce(ANNOUNCEMENTS.TEXT_GENERATION_ERROR);
    } finally {
      setGeneratePostLoading(false);
    }
  }, [onGeneratePost, announce]);

  const hasFormErrors = React.useMemo(() => Object.keys(formErrors).length > 0, [formErrors]);

  const handleCopyToClipboard = React.useCallback((content) => {
    console.log('Inhalt wird in die Zwischenablage kopiert');
    copyPlainText(content);
    announce(ANNOUNCEMENTS.CONTENT_COPIED);
  }, [announce]);

  useEffect(() => {
    console.log('useEffect: Barrierefreiheit wird eingerichtet');
    enhanceFocusVisibility();

    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: BUTTON_LABELS.SUBMIT },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
      { element: document.querySelector('.edit-button'), label: BUTTON_LABELS.EDIT },
    ];

    addAriaLabelsToElements(labelledElements);

    const interactiveElements = labelledElements.map(item => item.element).filter(Boolean);
    setupKeyboardNav(interactiveElements);
  }, [setupKeyboardNav]);

  const handleToggleEditMode = () => {
    console.log('Before toggle, value:', value);
    if (window.innerWidth <= 768) {
      // Für mobile Geräte
      document.body.style.overflow = isEditing ? 'auto' : 'hidden';
    }
    toggleEditMode();
    console.log('After toggle, value:', value);
  };

  const handleSaveClick = () => {
    setIsSaveLinkModalOpen(true);
  };



  return (
    <div className={`base-container ${isEditing ? 'editing-mode' : ''}`}>
      <div className="form-container">
        <form onSubmit={(e) => {
          e.preventDefault();
          console.log('Formular wird übermittelt');
          onSubmit();
        }}>
          <div className={`form-content ${hasFormErrors ? 'has-errors' : ''}`}>
            {children}
            {hasFormErrors && (
              <div className="form-errors" role="alert" aria-live="assertive">
                {Object.entries(formErrors).map(([field, message]) => (
                  <p key={field} className="error-message">
                    {message}
                  </p>
                ))}
              </div>
            )}
            <div className="button-container">
              <SubmitButton
                onClick={onSubmit}
                loading={loading}
                success={success}
                text={BUTTON_LABELS.SUBMIT}
                icon={<HiCog />}
                className="submit-button form-button"
                ariaLabel={ARIA_LABELS.SUBMIT}
              />
            </div>
            {error && (
              <p role="alert" aria-live="assertive" className="error-message">
                {error}
              </p>
            )}
          </div>
        </form>
      </div>

      <div className="content-container">
        <div className="display-container">
          <div className="display-header">
            <h3>{title}</h3>
            <div className="display-actions">
              {value && (
                <>
                  <button
                    onClick={() => handleCopyToClipboard(value)}
                    className="action-button copy-button"
                    aria-label={ARIA_LABELS.COPY}
                  >
                    <IoCopyOutline size={16} />
                  </button>
                  <button
                    onClick={handleSaveClick}
                    className="action-button save-button"
                    aria-label={ARIA_LABELS.SAVE}
                  >
                    <IoSaveOutline size={16} />
                  </button>
                  {allowEditing && (
                    <button
                      onClick={handleToggleEditMode}
                      className="action-button edit-button"
                      aria-label={isEditing ? ARIA_LABELS.SAVE : ARIA_LABELS.EDIT}
                    >
                      <IoPencil size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="display-content" style={{ fontSize: '16px' }}>
            <div className="generated-content-wrapper">
              <Editor />
            </div>
          </div>
          {generatedPost && (
            <div className="generated-post-container">
              <p>{generatedPost}</p>
              <div className="button-container">
                <SubmitButton
                  onClick={handleGeneratePost}
                  loading={generatePostLoading}
                  text={BUTTON_LABELS.REGENERATE_TEXT}
                  icon={<HiCog />}
                  className="generate-post-button"
                  ariaLabel={ARIA_LABELS.REGENERATE_TEXT}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <SaveLinkModal
        isOpen={isSaveLinkModalOpen}
        onClose={() => setIsSaveLinkModalOpen(false)}
        onSave={saveCurrentContent}
        savedLinks={savedLinks}
        onDelete={handleDeleteContent}
        onLoad={handleLoadContent}
      />
    </div>
  );
};

BaseForm.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  onGeneratePost: PropTypes.func,
  generatedPost: PropTypes.string,
  allowEditing: PropTypes.bool,
  initialContent: PropTypes.string,
};

export default BaseForm;
