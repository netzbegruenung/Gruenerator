import React, { useMemo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiLightBulb } from "react-icons/hi";
import { IoCopyOutline, IoPencil, IoSave, IoCheckmarkOutline } from "react-icons/io5";
import SubmitButton from './SubmitButton';
import useAccessibility from '../hooks/useAccessibility';
import { 
  addAriaLabelsToElements, 
  enhanceFocusVisibility,
} from '../utils/accessibilityHelpers';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
} from '../utils/constants';
import SocialMediaEditor from './SocialMediaEditor';
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';
import { useAutoScroll } from '../utils/commonFunctions';
import { Tooltip } from 'react-tooltip';
import '../../assets/styles/pages/baseform_social.css';


const BaseForm = ({
  title,
  onSubmit,
  loading,
  success,
  error,
  formErrors = {},
  generatedContent,
  textSize,
  renderFormInputs,
  editingPlatform,
  handleEditPost,
  handleSavePost,
  handlePostContentChange,
  submitButtonText = BUTTON_LABELS.SUBMIT,
  platformIcons,
}) => {
  const { announce, setupKeyboardNav } = useAccessibility();

  const hasFormErrors = useMemo(() => Object.keys(formErrors).length > 0, [formErrors]);

  useEffect(() => {
    enhanceFocusVisibility();
    
    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: submitButtonText },
      ...Object.keys(generatedContent).map(platform => ({
        element: document.querySelector(`.copy-button-${generateValidClassName(platform)}`),
        label: `${BUTTON_LABELS.COPY} ${platform}`
      }))
    ];
    
    addAriaLabelsToElements(labelledElements);
    
    const interactiveElements = labelledElements.map(item => item.element).filter(Boolean);
    return setupKeyboardNav(interactiveElements);
  }, [setupKeyboardNav, submitButtonText, generatedContent]);

  useEffect(() => {
    if (error) {
      announce(`Fehler aufgetreten: ${error}`);
    }
  }, [error, announce]);

  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editingPlatform, generatedContent]);

  const generateValidClassName = (str) => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  const [copyIcons, setCopyIcons] = useState({});

  const handleCopyContent = (platform, content) => {
    const textToCopy = platform === 'actionIdeas' ? content.join('\n') : content.content;
    
    copyFormattedContent(
      textToCopy,
      () => {
        announce(`${platform} content copied to clipboard`);
        setCopyIcons(prev => ({
          ...prev,
          [platform]: <IoCheckmarkOutline size={16} />
        }));
        setTimeout(() => {
          setCopyIcons(prev => ({
            ...prev,
            [platform]: <IoCopyOutline size={16} />
          }));
        }, 2000);
      },
      (error) => {
        console.error(`Error copying ${platform} content:`, error);
      }
    );
  };

  const getCombinedContent = () => {
    return Object.entries(generatedContent)
      .map(([platform, content]) => {
        const platformTitle = platform === 'actionIdeas' ? 'Aktionsideen' : platform;
        const contentText = platform === 'actionIdeas' 
          ? content.join('\n')
          : content.content;
        
        return `${platformTitle}:\n${contentText}\n\n`;
      })
      .join('');
  };

  const renderPlatformContent = (platform, content) => {
    if (typeof content !== 'object' || content === null) {
      console.error(`Invalid content for platform ${platform}:`, content);
      return null;
    }
  
    const Icon = platform === 'actionIdeas' ? HiLightBulb : (platformIcons[platform] || (() => null));
    const isEditing = editingPlatform === platform;
    const validClassName = generateValidClassName(platform);
  
    const cleanContent = (htmlContent) => {
      if (typeof htmlContent !== 'string') return htmlContent;
      return htmlContent
        .replace(/<p><br><\/p>/g, '')
        .replace(/^\s+|\s+$/g, '');
    };
  
    return (
      <div key={platform} className={`platform-content ${isEditing ? 'editing' : ''}`}>
        <div className="platform-header">
          <div className="platform-title">
            <div className="platform-icon">
              {Icon && <Icon size={20} />}
            </div>
            <h3 className="platform-name">
              {isEditing 
                ? "Grünerator Editor"
                : (platform === 'actionIdeas' ? 'Aktionsideen' : (content.title || platform))
              }
            </h3>
          </div>
          <div className="platform-actions">
            <button 
              onClick={() => handleCopyContent(platform, content)}
              className={`action-button copy-button-${validClassName}`}
              aria-label={`${ARIA_LABELS.COPY} ${platform}`}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "In die Zwischenablage kopieren"
              })}
            >
              {copyIcons[platform] || <IoCopyOutline size={16} />}
            </button>
            {isEditing ? (
              <button 
                onClick={() => handleSavePost(platform, content)} 
                className="action-button" 
                aria-label={`Save ${platform} content`}
                {...(!isMobileView && {
                  'data-tooltip-id': "action-tooltip",
                  'data-tooltip-content': "Änderungen speichern"
                })}
              >
                <IoSave size={16} />
              </button>
            ) : (
              <button 
                onClick={() => handleEditPost(platform)} 
                className="action-button" 
                aria-label={`Edit ${platform} content`}
                {...(!isMobileView && {
                  'data-tooltip-id': "action-tooltip",
                  'data-tooltip-content': "Beitrag bearbeiten"
                })}
              >
                <IoPencil size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="platform-body">
          <div className="generated-content-wrapper">
            {isEditing ? (
              platform === 'actionIdeas' ? (
                <textarea
                  ref={textareaRef}
                  value={content.join('\n')}
                  onChange={(e) => handlePostContentChange(platform, e.target.value)}
                  className="edit-content-textarea"
                />
              ) : (
                <SocialMediaEditor
                  value={content.content}
                  onChange={(value) => handlePostContentChange(platform, value)}
                  isEditing={isEditing}
                />
              )
            ) : (
              <>
                {platform === 'actionIdeas' ? (
                  <ul className="action-ideas-list">
                    {content.map((idea, index) => (
                      <li key={index}>{idea}</li>
                    ))}
                  </ul>
                ) : (
                  <div dangerouslySetInnerHTML={{ 
                    __html: cleanContent(content.content) 
                  }} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  const isMobile = window.innerWidth <= 768;
  
  // State für Content-Änderungen
  const [contentChanged, setContentChanged] = useState(false);

  // Effect um Änderungen am Content zu erkennen
  useEffect(() => {
    if (Object.keys(generatedContent).length > 0) {
      setContentChanged(true);
    }
  }, [generatedContent]);

  // Hook für automatisches Scrollen
  useAutoScroll({ 
    content: generatedContent, 
    changed: contentChanged 
  }, isMobile);

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

  const getErrorMessage = (error) => {
    if (!error) return '';
    
    const errorMessages = {
      '400': 'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403': 'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404': 'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429': 'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut.',
      '500': 'Ein unerwarteter Fehler ist aufgetreten. Unsere Techniker*innen wurden automatisch informiert und arbeiten an einer Lösung.',
      '529': 'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut.'
    };
  
    // Prüfe ob der error-string einen der Error Codes enthält
    for (const [code, message] of Object.entries(errorMessages)) {
      if (error.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut uns sehr leid. Bitte versuche es später erneut.`;
      }
    }
  
    // Standardfehlertext wenn kein spezifischer Code gefunden wurde
    return `Ein Fehler ist aufgetreten. Es tut uns sehr leid. Bitte versuche es später erneut.`;
  };

  return (
    <div className={`base-container social-media-baseform ${Object.keys(generatedContent).length > 0 ? 'has-generated-content' : ''}`}>
      <div className="form-container">
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}>
          <div className={`form-content ${Object.keys(generatedContent).length > 0 ? 'with-generated-content' : ''}`}>
            {renderFormInputs()}
            {hasFormErrors && (
              <div className="form-errors" role="alert" aria-live="assertive">
                {Object.entries(formErrors).map(([field, message]) => (
                  <p key={field} className="error-message">{message}</p>
                ))}
              </div>
            )}
            <div className="button-container">
              <SubmitButton
                onClick={onSubmit}
                loading={loading}
                success={success}
                text={submitButtonText}
                icon={<HiCog />}
                className="submit-button form-button"
                ariaLabel={ARIA_LABELS.SUBMIT}
              />
            </div>
            {error && <p role="alert" aria-live="assertive" className="error-message">{error}</p>}
          </div>
        </form>
      </div>
      <div className="content-container">
        <div className="display-container">
          <div className="display-header">
            <h3>{title}</h3>
            <div className="display-actions">
              {Object.keys(generatedContent).length > 0 && (
                <ExportToDocument 
                  content={getCombinedContent()} 
                  {...(!isMobileView && {
                    'data-tooltip-id': "action-tooltip",
                    'data-tooltip-content': "Als Dokument exportieren"
                  })}
                />
              )}
            </div>
          </div>
          <div className="display-content" style={{ fontSize: textSize }}>
            {error ? (
              <p role="alert" aria-live="assertive" className="error-message">
                {getErrorMessage(error)}
              </p>
            ) : (
              Object.entries(generatedContent).map(([platform, content]) => 
                renderPlatformContent(platform, content)
              )
            )}
          </div>
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
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  generatedContent: PropTypes.object,
  textSize: PropTypes.string,
  renderFormInputs: PropTypes.func.isRequired,
  editingPlatform: PropTypes.string,
  handleEditPost: PropTypes.func.isRequired,
  handleSavePost: PropTypes.func.isRequired,
  handlePostContentChange: PropTypes.func.isRequired,
  submitButtonText: PropTypes.string,
  platformIcons: PropTypes.object.isRequired,
};

export default BaseForm;