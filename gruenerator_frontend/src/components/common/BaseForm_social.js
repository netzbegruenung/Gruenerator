import React, { useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiLightBulb } from "react-icons/hi";
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin } from "react-icons/fa";
import { IoCopyOutline, IoPencil, IoSave } from "react-icons/io5";
import SubmitButton from './SubmitButton';
import useAccessibility from '../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import { handleCopyToClipboard } from '../utils/commonFunctions';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
} from '../utils/constants';

const platformIcons = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  twitter: FaTwitter,
  linkedin: FaLinkedin
};

const generateValidClassName = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
};

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
              onClick={() => handleCopyToClipboard(platform === 'actionIdeas' ? content.join('\n') : `${content.content}\n\n${content.hashtags.join(' ')}`)} 
              className={`copy-button copy-button-${validClassName}`}
              aria-label={`${ARIA_LABELS.COPY} ${platform}`}
            >
              <IoCopyOutline size={16} />
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
              <textarea
                ref={textareaRef}
                value={platform === 'actionIdeas' ? content.join('\n') : `${content.content}\n\n${content.hashtags.join(' ')}`}
                onChange={(e) => {
                  const value = e.target.value;
                  if (platform === 'actionIdeas') {
                    handlePostContentChange(platform, value.split('\n'), []);
                  } else {
                    const lastNewLineIndex = value.lastIndexOf('\n\n');
                    const newContent = value.substring(0, lastNewLineIndex);
                    const newHashtags = value.substring(lastNewLineIndex + 2).split(' ');
                    handlePostContentChange(platform, newContent, newHashtags);
                  }
                }}
                className="edit-content-textarea"
              />
            ) : (
              <>
                {platform === 'actionIdeas' ? (
                  <ul className="action-ideas-list">
                    {content.map((idea, index) => (
                      <li key={index}>{idea}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <div>{content.content}</div>
                    {Array.isArray(content.hashtags) && content.hashtags.length > 0 && (
                      <div className="hashtags">
                        {content.hashtags.map((hashtag, index) => (
                          <span key={index} className="hashtag">{hashtag}</span>
                        ))}
                      </div>
                    )}
                  </>
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
      <div className="container">
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
        <div className="display-container">
      <h3>{title}</h3>
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
  includeActionIdeas: PropTypes.bool,
};

export default BaseForm;