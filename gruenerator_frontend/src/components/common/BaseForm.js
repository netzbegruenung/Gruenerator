import React, { useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import SubmitButton from './SubmitButton';
import CopyButton from './CopyButton';
import useAccessibility from '../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
  ANNOUNCEMENTS
} from '../utils/constants';

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
  onGeneratePost,
  generatedPost,
}) => {
  const { announce, setupKeyboardNav } = useAccessibility();
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);

  const handleGeneratePost = useCallback(async () => {
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

  const hasFormErrors = useMemo(() => Object.keys(formErrors).length > 0, [formErrors]);

  useEffect(() => {
    enhanceFocusVisibility();
    
    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: submitButtonText },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
    ];
    
    addAriaLabelsToElements(labelledElements);
    
    const interactiveElements = labelledElements.map(item => item.element).filter(Boolean);
    return setupKeyboardNav(interactiveElements);
  }, [setupKeyboardNav, submitButtonText]);

  useEffect(() => {
    if (error) {
      announce(`Fehler aufgetreten: ${error}`);
    }
  }, [error, announce]);

  return (
    <div className={`base-container ${generatedContent ? 'with-content' : ''}`}>
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
            <div className="generated-content-wrapper">
              {generatedContent}
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
          {generatedContent && (
            <div className="copy-button-container">
              <CopyButton content={generatedContent} />
            </div>
          )}
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
  generatedContent: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  textSize: PropTypes.string,
  submitButtonText: PropTypes.string,
  showGeneratePostButton: PropTypes.bool,
  onGeneratePost: PropTypes.func,
  generatedPost: PropTypes.string,
};

export default BaseForm;