// BaseForm.js
import React, { useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import Button from './Button';
import DownloadButton from './DownloadButton';
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
  onBack,
  loading,
  success,
  error,
  formErrors = {},
  generatedContent,
  textSize,
  useDownloadButton = false,
  showBackButton = false,
  submitButtonText = BUTTON_LABELS.SUBMIT,
  showGeneratePostButton = false,
  onGeneratePost,
  generatedPost,
  isSharepicGenerator = false
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
  const isGeneratedContentImage = useMemo(() => 
    typeof generatedContent === 'string' && generatedContent.startsWith('data:image'),
    [generatedContent]
  );

  useEffect(() => {
    enhanceFocusVisibility();
    
    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: submitButtonText },
      { element: document.querySelector('.back-button'), label: BUTTON_LABELS.BACK },
      { element: document.querySelector('.download-button'), label: BUTTON_LABELS.DOWNLOAD },
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
                {showBackButton && (
                  <Button 
                    onClick={onBack} 
                    text={BUTTON_LABELS.BACK}
                    className="back-button"
                    ariaLabel={ARIA_LABELS.BACK}
                  />
                )}
                <Button
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
            {isGeneratedContentImage ? (
              <>
                <img src={generatedContent} alt="Generiertes Sharepic" style={{ maxWidth: '100%' }} />
                <div className="button-container">
                  {!generatedPost && showGeneratePostButton && (
                    <Button
                      onClick={handleGeneratePost}
                      loading={generatePostLoading}
                      text={BUTTON_LABELS.GENERATE_TEXT}
                      icon={<HiCog />}
                      className="generate-post-button"
                      ariaLabel={ARIA_LABELS.GENERATE_POST}
                    />
                  )}
                  {useDownloadButton && (
                    <DownloadButton imageUrl={generatedContent} />
                  )}
                </div>
              </>
            ) : (
              <div>{generatedContent}</div>
            )}
            {generatedPost && (
              <div className="generated-post-container">
                <p>{generatedPost}</p>
                <div className="button-container">
                  <CopyButton 
                    content={generatedPost} 
                    text={isSharepicGenerator ? "Beitragstext kopieren" : "In die Zwischenablage kopieren"}
                  />
                  <Button
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
      </div>
    </div>
  );
};

BaseForm.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  generatedContent: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  textSize: PropTypes.string,
  useDownloadButton: PropTypes.bool,
  showBackButton: PropTypes.bool,
  submitButtonText: PropTypes.string,
  showGeneratePostButton: PropTypes.bool,
  onGeneratePost: PropTypes.func,
  generatedPost: PropTypes.string,
  isSharepicGenerator: PropTypes.bool,
};

export default BaseForm;