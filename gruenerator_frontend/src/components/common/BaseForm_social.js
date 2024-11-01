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
  
    return (
      <div key={platform} className="platform-content">
        <div className="platform-header">
          <div className="platform-title">
            <div className="platform-icon">
              {Icon && <Icon size={20} />}
            </div>
            <h3 className="platform-name">{platform === 'actionIdeas' ? 'Aktionsideen' : (content.title || platform)}</h3>
          </div>
          <div className="platform-actions">
            <button 
              onClick={() => handleCopyContent(platform, content)}
              className={`copy-button copy-button-${validClassName}`}
              aria-label={`${ARIA_LABELS.COPY} ${platform}`}
            >
              {copyIcons[platform] || <IoCopyOutline size={16} />}
            </button>
            {isEditing ? (
              <button 
                onClick={() => handleSavePost()} 
                className="save-button" 
                aria-label={`Save ${platform} content`}
              >
                <IoSave size={16} />
              </button>
            ) : (
              <button 
                onClick={() => handleEditPost(platform)} 
                className="edit-button" 
                aria-label={`Edit ${platform} content`}
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
                  <div dangerouslySetInnerHTML={{ __html: content.content }} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="base-container social-media-baseform">
      <div className="form-container">
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}>
          <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
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
                <ExportToDocument content={getCombinedContent()} />
              )}
            </div>
          </div>
          <div className="display-content" style={{ fontSize: textSize }}>
            {Object.entries(generatedContent).map(([platform, content]) => renderPlatformContent(platform, content))}
          </div>
        </div>
      </div>
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