import React, { useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiLightBulb } from "react-icons/hi";
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin } from "react-icons/fa";
import { IoCopyOutline } from "react-icons/io5";
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
  children,
  onSubmit,
  loading,
  success,
  error,
  formErrors = {},
  generatedContent,
  textSize,
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

  return (
    <div className="base-container social-media-baseform">
      <div className="container">
        <div className="form-container">
          <form onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}>
            <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
              {children}
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
          {Object.entries(generatedContent).map(([platform, content]) => {
  const Icon = platformIcons[platform] || (() => null);
  const validClassName = generateValidClassName(platform);
  return (
    <div key={platform} className="platform-content">
      <div className="platform-header">
        <div className="platform-title">
          <div className="platform-icon">
            {Icon && <Icon size={20} />}
          </div>
          <h3 className="platform-name">{content.title}</h3>
        </div>
        <button 
          onClick={() => handleCopyToClipboard(`${content.content}\n\n${content.hashtags.join(' ')}`)} 
          className={`copy-button copy-button-${validClassName}`} 
          aria-label={`${ARIA_LABELS.COPY} ${platform}`}
        >
          <IoCopyOutline size={16} />
        </button>
      </div>
      <div className="platform-body">
        <div className="generated-content-wrapper">
          {content.content}
          <div className="hashtags">
            {content.hashtags.map((hashtag, index) => (
              <span key={index} className="hashtag">{hashtag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
})}
{generatedContent.actionIdeas && (
  <div className="action-ideas">
    <div className="platform-header">
      <div className="platform-title">
        <div className="platform-icon">
          <HiLightBulb size={20} />
        </div>
        <h3 className="platform-name">Aktionsideen</h3>
      </div>
      <button 
        onClick={() => handleCopyToClipboard(generatedContent.actionIdeas.join('\n'))} 
        className="copy-button copy-button-action-ideas" 
        aria-label={ARIA_LABELS.COPY_ACTION_IDEAS}
      >
        <IoCopyOutline size={16} />
      </button>
    </div>
    <div className="platform-body">
      <div className="generated-content-wrapper">
        <ul>
          {generatedContent.actionIdeas.map((idea, index) => (
            <li key={index}>{idea}</li>
          ))}
        </ul>
      </div>
    </div>
  </div>
)}
          </div>
        </div>
      </div>
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
  generatedContent: PropTypes.object,
  textSize: PropTypes.string,
  submitButtonText: PropTypes.string,
};

export default BaseForm;