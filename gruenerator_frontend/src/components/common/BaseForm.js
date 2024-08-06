import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import Button from './Button';
import DownloadButton from './DownloadButton';
import GeneratePostButton from './GeneratePostButton';
import FormErrors from './FormErrors';
import GeneratedPostContainer from './GeneratedPostContainer';
import useAccessibility from '../hooks/useAccessibility';
import UnsplashImageSelector from '../utils/Unsplash/UnsplashImageSelector';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../utils/accessibilityHelpers';
import ImageSearchBar from './ImageSearchBar';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
  FORM_STEPS
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
  generatePostLoading,
  generatedPost,
  isSharepicGenerator = false,
  onUnsplashSearch,
  currentStep,
  unsplashImages,
  onUnsplashSelect,
  unsplashLoading,
  isLoadingUnsplashImages, // Stellen Sie sicher, dass dieser Prop hier definiert ist
  fileUploadComponent,
  forceUpdateKey,
}) => {
  const handleImageSearch = (query) => {
    console.log('BaseForm: Image search triggered with query:', query);
    if (onUnsplashSearch) {
      onUnsplashSearch(query);
    }
  };
  
  
  const { announce, setupKeyboardNav } = useAccessibility();

  const [isSearchBarActive, setIsSearchBarActive] = useState(false);

  console.log('BaseForm: Rendering with props', {
    currentStep,
    unsplashImages,
    unsplashLoading,
    isLoadingUnsplashImages,
    error
  });

  useEffect(() => {
    enhanceFocusVisibility();
    
    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: submitButtonText },
      { element: document.querySelector('.back-button'), label: BUTTON_LABELS.BACK },
      { element: document.querySelector('.download-button'), label: BUTTON_LABELS.DOWNLOAD },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
      { element: document.querySelector('.unsplash-button'), label: BUTTON_LABELS.UNSPLASH_SELECT },
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
              if (!e.target.closest('.image-search-form')) {
              onSubmit();
              }
            }}>
              <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
                {children}
                <FormErrors errors={formErrors} />
                {currentStep === FORM_STEPS.PREVIEW && (
  <div className="upload-and-search-container">
    {React.cloneElement(fileUploadComponent, { isCompact: isSearchBarActive })}
    <ImageSearchBar
  onSearch={handleImageSearch}
  isActive={isSearchBarActive}
  setIsActive={setIsSearchBarActive}
  loading={unsplashLoading}
/>
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
              {currentStep === FORM_STEPS.PREVIEW && (
                isLoadingUnsplashImages ? (
                  <div>Lade Bilder...</div>
                ) : error ? (
                  <div>{error}</div>
                ) : unsplashImages && unsplashImages.length > 0 ? (
                  <>
                    {console.log('BaseForm: Rendering UnsplashImageSelector with', unsplashImages.length, 'images')}
                    <UnsplashImageSelector
                      images={unsplashImages}
                      onSelect={onUnsplashSelect}
                      forceUpdateKey={forceUpdateKey}

                    />
                  </>
                ) : (
                  <div>Keine Bilder verfügbar</div>
                )
              )}
              {((currentStep === FORM_STEPS.RESULT) || (!currentStep)) && (
                <>
                  {typeof generatedContent === 'string' && generatedContent.startsWith('data:image') ? (
                    <>
                      <img src={generatedContent} alt="Generiertes Sharepic" style={{ maxWidth: '100%' }} />
                      <div className="button-container">
                        {useDownloadButton && (
                          <DownloadButton imageUrl={generatedContent} />
                        )}
                        {showGeneratePostButton && !generatedPost && (
                          <GeneratePostButton
                            onClick={onGeneratePost}
                            loading={generatePostLoading}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div>{generatedContent}</div>
                  )}
                </>
              )}
              <GeneratedPostContainer
                post={generatedPost}
                onGeneratePost={onGeneratePost}
                generatePostLoading={generatePostLoading}
                isSharepicGenerator={isSharepicGenerator}
              />
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
  generatePostLoading: PropTypes.bool,
  generatedPost: PropTypes.string,
  isSharepicGenerator: PropTypes.bool,
  currentStep: PropTypes.number,
  unsplashImages: PropTypes.array,
  onUnsplashSelect: PropTypes.func,
    isLoadingUnsplashImages: PropTypes.bool,
      onUnsplashSearch: PropTypes.func.isRequired,
  unsplashLoading: PropTypes.bool,
  fileUploadComponent: PropTypes.node,
  unsplashError: PropTypes.string,
  fetchFullSizeImage: PropTypes.func,
  triggerDownload: PropTypes.func,
  forceUpdateKey: PropTypes.number,

};

export default BaseForm;