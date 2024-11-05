import React, { useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import SubmitButton from './SubmitButton';
import useAccessibility from '../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import { BUTTON_LABELS, ARIA_LABELS, ANNOUNCEMENTS } from '../utils/constants';
import { IoCopyOutline, IoPencil, IoCheckmarkOutline } from 'react-icons/io5';
import Editor from './Editor';
import { copyFormattedContent, useAutoScroll } from '../utils/commonFunctions';
import { FormContext } from '../utils/FormContext';
import ExportToDocument from './ExportToDocument';
import { Tooltip } from 'react-tooltip';

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
  alwaysEditing = false,
  hideEditButton = false,
}) => {
  console.log('BaseForm wird gerendert', { title, loading, success, error });

  const {
    value,
    isEditing,
    toggleEditMode,
    updateValue,
  } = useContext(FormContext);

  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);

  useEffect(() => {
    if (initialContent) {
      updateValue(initialContent);
    }
  }, [initialContent, updateValue]);

  const { announce, setupKeyboardNav } = useAccessibility();
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
  // const [isSaveLinkModalOpen, setIsSaveLinkModalOpen] = useState(false);
  

  // useEffect(() => {
  //   if (originalLinkData && !linkData) {
  //     setLinkData(originalLinkData);
  //   }
  // }, [originalLinkData, linkData, setLinkData]);

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
    copyFormattedContent(
      content,
      () => {
        announce(ANNOUNCEMENTS.CONTENT_COPIED);
        setCopyIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setCopyIcon(<IoCopyOutline size={16} />);
        }, 2000);
      },
      (error) => {
        console.error('Fehler beim Kopieren:', error);
      }
    );
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
      document.body.style.overflow = isEditing ? 'auto' : 'hidden';
    }
    toggleEditMode();
    console.log('After toggle, value:', value);
  };

// const handleSaveClick = async () => {
//   if (linkData) {
//     try {
//       const result = await saveCurrentContent(linkData.linkName, linkData.generatedLink);
//       if (result.success) {
//         setSaveIcon(<IoCheckmarkOutline size={16} />);
//         setTimeout(() => {
//           setSaveIcon(<IoSaveOutline size={16} />);
//         }, 2000);
//       } else {
//         console.error(`Fehler beim Speichern: ${result.error}`);
//       }
//     } catch (error) {
//       console.error(`Fehler beim Speichern: ${error.message}`);
//     }
//   } else {
//     setIsSaveLinkModalOpen(true);
//   }
// };

  useEffect(() => {
    if (alwaysEditing && !isEditing) {
      toggleEditMode();
    }
  }, [alwaysEditing, isEditing, toggleEditMode]);

  const displayTitle = React.useMemo(() => {
    const isMobile = window.innerWidth <= 768;
    return isMobile && isEditing ? "Grünerator Editor" : title;
  }, [isEditing, title]);

  const isMobile = window.innerWidth <= 768;
  
  // Wir fügen einen State hinzu, um zu tracken ob der Content sich geändert hat
  const [contentChanged, setContentChanged] = useState(false);

  // Effect um Änderungen am Content zu erkennen
  useEffect(() => {
    if (value) {
      setContentChanged(true);
    }
  }, [value]);

  // Hook für automatisches Scrollen - jetzt mit contentChanged
  useAutoScroll({ content: value, changed: contentChanged }, isMobile);

  // Reset contentChanged wenn der User scrollt
  useEffect(() => {
    const handleScroll = () => {
      setContentChanged(false);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`base-container ${isEditing ? 'editing-mode' : ''} ${title === "Grünerator Antragscheck" ? 'antragsversteher-base' : ''}`}>
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
            <h3>{displayTitle}</h3>
            <div className="display-actions">
              {value && (
                <>
                  <button
                    onClick={() => handleCopyToClipboard(value)}
                    className="action-button"
                    aria-label={ARIA_LABELS.COPY}
                    {...(!isMobileView && {
                      'data-tooltip-id': "action-tooltip",
                      'data-tooltip-content': "Kopieren"
                    })}
                  >
                    {copyIcon}
                  </button>
                  <button
                    className="action-button"
                    {...(!isMobileView && {
                      'data-tooltip-id': "action-tooltip",
                      'data-tooltip-content': "Als Dokument exportieren"
                    })}
                  >
                    <ExportToDocument content={value} />
                  </button>
                  {allowEditing && !hideEditButton && (
                    <button
                      onClick={handleToggleEditMode}
                      className="action-button"
                      aria-label={isEditing ? ARIA_LABELS.SAVE : ARIA_LABELS.EDIT}
                      {...(!isMobileView && {
                        'data-tooltip-id': "action-tooltip",
                        'data-tooltip-content': isEditing ? "Bearbeiten beenden" : "Bearbeiten"
                      })}
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
      {!isMobileView && (
        <Tooltip id="action-tooltip" place="bottom" />
      )}
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
  alwaysEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  // originalLinkData: PropTypes.object,
};

export default BaseForm;