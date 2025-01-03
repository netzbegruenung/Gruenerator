import React, { useContext, useEffect, useState, Suspense } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import SubmitButton from './SubmitButton';
import useAccessibility from '../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import { BUTTON_LABELS, ARIA_LABELS, ANNOUNCEMENTS } from '../utils/constants';
import Editor from './Editor';
import { useAutoScroll } from '../utils/commonFunctions';
import { FormContext } from '../utils/FormContext';
import { Tooltip } from 'react-tooltip';
import ActionButtons from './ActionButtons';
import PlatformContainer from './PlatformContainer';
import FormToggleButton from './FormToggleButton';
import '../../assets/styles/components/form-toggle-button.css';

const BackupToggle = React.lazy(() => import('./BackupToggle'));

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
  useBackupProvider,
  setUseBackupProvider,
  isMultiStep = false,
  onBack,
  showBackButton = false,
  nextButtonText,
  generatedContent,
  hideDisplayContainer = false,
  usePlatformContainers = false,
}) => {
  const {
    value,
    isEditing,
    toggleEditMode,
    updateValue,
  } = useContext(FormContext);

  console.log('[BaseForm] Props:', { 
    allowEditing, 
    alwaysEditing, 
    hideEditButton, 
    usePlatformContainers 
  });
  console.log('[BaseForm] Context:', { 
    isEditing, 
    hasValue: !!value 
  });

  useEffect(() => {
    console.log('[BaseForm] isEditing Status geändert:', isEditing);
  }, [isEditing]);

  const [isFormVisible, setIsFormVisible] = useState(true);
  const [isMultiPlatform, setIsMultiPlatform] = useState(false);

  useEffect(() => {
    if (initialContent) {
      updateValue(initialContent);
    }
  }, [initialContent, updateValue]);

  useEffect(() => {
    if (value && usePlatformContainers) {
      const platformCount = (value.match(/(TWITTER|FACEBOOK|INSTAGRAM|LINKEDIN|ACTIONIDEAS|INSTAGRAM REEL):/g) || []).length;
      setIsMultiPlatform(platformCount >= 2);
      if (platformCount >= 2 && isFormVisible) {
        setIsFormVisible(false);
      }
    }
  }, [value, usePlatformContainers]);

  const toggleForm = () => {
    setIsFormVisible(prev => !prev);
  };

  const { announce, setupKeyboardNav } = useAccessibility();
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);

  const handleGeneratePost = React.useCallback(async () => {
    setGeneratePostLoading(true);
    announce(ANNOUNCEMENTS.GENERATING_TEXT);
    try {
      await onGeneratePost();
      announce(ANNOUNCEMENTS.TEXT_GENERATED);
    } catch (error) {
      announce(ANNOUNCEMENTS.TEXT_GENERATION_ERROR);
    } finally {
      setGeneratePostLoading(false);
    }
  }, [onGeneratePost, announce]);

  const hasFormErrors = React.useMemo(() => Object.keys(formErrors).length > 0, [formErrors]);

  useEffect(() => {
    enhanceFocusVisibility();

    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: BUTTON_LABELS.SUBMIT },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
      { element: document.querySelector('.edit-button'), label: BUTTON_LABELS.EDIT },
    ].filter(item => item.element !== null);

    if (labelledElements.length > 0) {
      addAriaLabelsToElements(labelledElements);
      const interactiveElements = labelledElements.map(item => item.element);
      setupKeyboardNav(interactiveElements);
    }
  }, [setupKeyboardNav, generatedContent]);

  const handleToggleEditMode = () => {
    console.log('[BaseForm] Toggle Edit Mode aufgerufen');
    toggleEditMode();
  };

  useEffect(() => {
    if (alwaysEditing && !isEditing) {
      toggleEditMode();
    }
  }, [alwaysEditing, isEditing, toggleEditMode]);

  const displayTitle = React.useMemo(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && isEditing) return "Grünerator Editor";
    if (!generatedContent) return title;
    const helpDisplay = generatedContent?.props?.['data-display-title'];
    return helpDisplay || title;
  }, [generatedContent, title, isEditing]);

  const isMobile = window.innerWidth <= 768;
  
  const [contentChanged, setContentChanged] = useState(false);

  useEffect(() => {
    if (value) {
      setContentChanged(true);
    }
  }, [value]);

  useAutoScroll({ content: value, changed: contentChanged }, isMobile);

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

  const getErrorMessage = (error) => {
    if (!error) return '';
    
    const errorMessages = {
      '400': 'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403': 'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404': 'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429': 'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
      '500': 'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
      '529': 'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.'
    };

    for (const [code, message] of Object.entries(errorMessages)) {
      if (error.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }

    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit();
    } catch (error) {
      console.error('[BaseForm] Submit error:', error);
    }
  };

  const renderContent = () => {
    console.log('[BaseForm] Rendere Content:', { 
      value, 
      generatedContent,
      isEditing,
      usePlatformContainers
    });
    
    // Wenn kein Content vorhanden ist, nichts rendern
    if (!value && !generatedContent) {
      console.log('[BaseForm] Kein Content vorhanden');
      return null;
    }

    // Im Edit-Modus immer den Editor anzeigen
    if (isEditing) {
      console.log('[BaseForm] Editor-Modus');
      return (
        <div className="generated-content-wrapper">
          <Editor value={value || ''} />
        </div>
      );
    }

    // Platform Container nur anzeigen wenn aktiviert
    if (usePlatformContainers && value) {
      console.log('[BaseForm] Prüfe Platform Container');
      const hasPlatformHeaders = value.includes('TWITTER:') || 
                                value.includes('FACEBOOK:') || 
                                value.includes('INSTAGRAM:') || 
                                value.includes('LINKEDIN:') || 
                                value.includes('AKTIONSIDEEN:') || 
                                value.includes('INSTAGRAM REEL:');

      if (hasPlatformHeaders) {
        console.log('[BaseForm] Zeige Platform Container');
        return (
          <div className="generated-content-wrapper">
            <PlatformContainer content={value} key={Date.now()} />
          </div>
        );
      }
    }

    // Standard Editor anzeigen
    console.log('[BaseForm] Standard Editor');
    return (
      <div className="generated-content-wrapper">
        <Editor value={value || ''} />
      </div>
    );
  };

  const getExportableContent = () => {
    if (generatedContent) {
      return typeof generatedContent === 'string' ? generatedContent : generatedContent?.content || '';
    }
    return value || '';
  };

  const baseContainerClasses = [
    'base-container',
    isEditing ? 'editing-mode' : '',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : '',
    isMultiPlatform ? 'multi-platform' : '',
    !isFormVisible ? 'form-hidden' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={baseContainerClasses}>
      {isMultiPlatform && (
        <FormToggleButton
          isFormVisible={isFormVisible}
          toggleForm={toggleForm}
        />
      )}
      <div className={`form-container ${isFormVisible ? 'visible' : ''}`}>
        <form onSubmit={handleSubmit}>
          <div className={`form-content ${hasFormErrors ? 'has-errors' : ''}`}>
            {children}
            {title !== "Grünerator Antragscheck" && title !== "Wahlprüfstein-Generator Bundestagswahl" && (
              <Suspense fallback={<div>Lade...</div>}>
                <BackupToggle 
                  useBackupProvider={useBackupProvider}
                  setUseBackupProvider={setUseBackupProvider}
                />
              </Suspense>
            )}
            {isMultiStep ? (
              <div className={`button-container ${showBackButton ? 'form-buttons' : ''}`}>
                {showBackButton && (
                  <button 
                    type="button" 
                    onClick={onBack} 
                    className="back-button form-button"
                  >
                    Zurück
                  </button>
                )}
                <SubmitButton
                  onClick={onSubmit}
                  loading={loading}
                  success={success}
                  text={nextButtonText || 'Weiter'}
                  icon={<HiCog />}
                  className={`submit-button form-button ${showBackButton ? 'with-back-button' : ''}`}
                  ariaLabel={nextButtonText || 'Weiter'}
                />
              </div>
            ) : (
              <div className="button-container">
                <SubmitButton
                  onClick={onSubmit}
                  loading={loading}
                  success={success}
                  text="Grünerieren"
                  icon={<HiCog />}
                  className="submit-button form-button"
                  ariaLabel="Generieren"
                />
              </div>
            )}
          </div>
        </form>
      </div>
      {!hideDisplayContainer && (
        <div className="display-container">
          <div className="display-header">
            <h3>{displayTitle}</h3>
            {generatedContent && (
              <ActionButtons 
                content={getExportableContent()}
                onEdit={handleToggleEditMode}
                isEditing={isEditing}
                allowEditing={allowEditing}
                hideEditButton={hideEditButton}
                showExport={true}
              />
            )}
          </div>
          <div className="display-content" style={{ fontSize: '16px' }}>
            {error && (
              <p role="alert" aria-live="assertive" className="error-message">
                {getErrorMessage(error)}
              </p>
            )}
            {renderContent()}
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
      )}
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
  useBackupProvider: PropTypes.bool,
  setUseBackupProvider: PropTypes.func,
  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      content: PropTypes.string
    })
  ]),
  hideDisplayContainer: PropTypes.bool,
  usePlatformContainers: PropTypes.bool
};

export default BaseForm;