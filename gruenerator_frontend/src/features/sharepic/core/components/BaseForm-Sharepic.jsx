import React, { useEffect, useMemo, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiChevronDown, HiChevronUp } from "react-icons/hi";
import Button from '../../../../components/common/SubmitButton';
import DownloadButton from './DownloadButton';
import FileUpload from '../../../../components/utils/FileUpload';
import UnsplashButton from './UnsplashButton';
import { useSharepicStore } from '../../../../stores';
import AdvancedEditingSection from '../../dreizeilen/components/AdvancedEditingSection';
import HelpDisplay from '../../../../components/common/HelpDisplay';
import FormErrors from '../../../../components/common/FormErrors';
import SharepicBackendResult from './SharepicBackendResult';
import CopyButton from '../../../../components/common/CopyButton';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import useAltTextGeneration from '../../../../components/hooks/useAltTextGeneration';

import { 
  ColorSchemeControl, 
  FontSizeControl, 
  CreditControl,
} from '../../../../components/utils/ImageModificationForm';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
  FORM_STEPS,
} from '../../../../components/utils/constants';
import { SloganAlternativesButton, SloganAlternativesDisplay } from '../components/SloganAlternatives';

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
  fileUploadProps,
  useDownloadButton = false,
  showBackButton = false,
  submitButtonText = BUTTON_LABELS.SUBMIT,
  fontSize,
  balkenOffset,
  colorScheme,
  onControlChange,
  isSubmitting,
  currentSubmittingStep,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
  helpContent
}) => {
  const {
    // State
    currentStep, generatedImageSrc, isAdvancedEditingOpen, selectedImage,
    type, thema, details, line1, line2, line3, quote, name, fontSize: storeFontSize,
    balkenOffset: storeBalkenOffset, colorScheme: storeColorScheme, 
    balkenGruppenOffset: storeBalkenGruppenOffset, sunflowerOffset: storeSunflowerOffset,
    credit: storeCredit, searchTerms, sloganAlternatives, uploadedImage,
    // Actions
    toggleAdvancedEditing, handleChange
  } = useSharepicStore();

  // Create formData object for compatibility with existing code
  const formData = {
    type, thema, details, line1, line2, line3, quote, name,
    fontSize: storeFontSize, balkenOffset: storeBalkenOffset, 
    colorScheme: storeColorScheme, balkenGruppenOffset: storeBalkenGruppenOffset,
    sunflowerOffset: storeSunflowerOffset, credit: storeCredit, 
    searchTerms, sloganAlternatives, uploadedImage
  };

  // Alt text state management
  const [showAltTextSection, setShowAltTextSection] = useState(false);
  const [generatedAltText, setGeneratedAltText] = useState('');
  
  // Alt text generation hook
  const { 
    loading: altTextLoading, 
    error: altTextError, 
    generateAltTextForImage,
    resetState: resetAltTextState 
  } = useAltTextGeneration();

  useEffect(() => {
    console.log('BaseForm: Current step changed to', currentStep);
  }, [currentStep]);

  useEffect(() => {
    console.log('BaseForm props update:', {
      currentStep,
      isSubmitting,
      currentSubmittingStep,
    });
  }, [currentStep, isSubmitting, currentSubmittingStep]);

  useEffect(() => {
    if (isAdvancedEditingOpen) {
      const advancedSection = document.querySelector('.advanced-editing-section');
      if (advancedSection) {
        advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [isAdvancedEditingOpen]);

  const handleAltTextClick = useCallback(async () => {
    if (!generatedImageSrc) {
      console.error('[BaseForm] No generated image available for alt text generation');
      return;
    }

    // Show the section and reset states
    setShowAltTextSection(true);
    setGeneratedAltText('');
    resetAltTextState();

    try {
      // Create image description from form data for better alt text context
      let imageDescription = '';
      if (formData.type === 'Zitat' && formData.quote) {
        imageDescription = `Zitat-Sharepic mit dem Text: "${formData.quote}"`;
        if (formData.name) {
          imageDescription += ` von ${formData.name}`;
        }
      } else if (formData.line1 || formData.line2 || formData.line3) {
        const lines = [formData.line1, formData.line2, formData.line3].filter(Boolean);
        imageDescription = `Sharepic mit dem Text: "${lines.join(' ')}"`;
      } else if (formData.thema) {
        imageDescription = `Sharepic zum Thema: ${formData.thema}`;
      }

      const response = await generateAltTextForImage(generatedImageSrc, imageDescription);
      if (response && response.altText) {
        setGeneratedAltText(response.altText);
      }
    } catch (error) {
      console.error('[BaseForm] Alt text generation failed:', error);
      // Error state is handled by the hook and displayed inline
    }
  }, [generatedImageSrc, formData, generateAltTextForImage, resetAltTextState]);

  const formButtons = useMemo(() => ({
    showBack: showBackButton,
    submitText: submitButtonText,
    loading,
    success
  }), [showBackButton, submitButtonText, loading, success]);

  const renderFormButtons = () => (
    <div className="button-container">
      {formButtons.showBack && (
        <div className="button-wrapper">
          <Button 
            onClick={onBack} 
            text={BUTTON_LABELS.BACK}
            className="back-button"
            ariaLabel={ARIA_LABELS.BACK}
          />
        </div>
      )}
      {currentStep !== FORM_STEPS.RESULT && (
        <div className="button-wrapper">
          <Button
            onClick={onSubmit}
            loading={formButtons.loading}
            success={formButtons.success}
            text={formButtons.submitText}
            icon={<HiCog />}
            className="form-button"
            ariaLabel={ARIA_LABELS.SUBMIT}
          />
        </div>
      )}
    </div>
  );

  const renderInputStep = () => (
    <div className="input-fields-wrapper">
      {children}
      {formData.type === 'Zitat' && (
        <div className="form-group">
          <h3>Zitiert wird</h3>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name || ''}
            onChange={handleChange}
            placeholder="Maxi Mustermensch"
            required
            className={`form-input ${formErrors.name ? 'error-input' : ''}`}
          />
          {formErrors.name && <span className="error-message">{formErrors.name}</span>}
        </div>
      )}
      {renderFormButtons()}
    </div>
  );

  const renderPreviewStep = () => (
    <>
      <div className="input-fields-wrapper">
        {children}
      </div>
      <div className="action-buttons three-buttons">
        <div className="button-wrapper">
          <SloganAlternativesButton {...fileUploadProps.alternativesButtonProps} buttonText={formData.type === 'Zitat' ? "Andere Zitate" : "Anderer Slogan"} />
        </div>
        {(formData.type === 'Dreizeilen' || formData.type === 'Zitat') && (
          <>
            <div className="button-wrapper">
              <UnsplashButton 
                searchTerms={formData.searchTerms}
              />
            </div>
            <div className="button-wrapper">
              <FileUpload {...fileUploadProps} buttonText="Upload" />
            </div>
          </>
        )}
      </div>
      <div className="button-container">
        {renderFormButtons()}
      </div>
    </>
  );

  const handleSocialMediaClick = useCallback(() => {
    const url = new URL(window.location.origin + '/presse-social');
    url.searchParams.append('thema', formData.thema || '');
    url.searchParams.append('details', formData.details || '');
    window.open(url.toString(), '_blank');
  }, [formData]);

  const renderResultStep = () => {
    return (
      <SharepicBackendResult
        onSubmit={onSubmit}
        loading={loading}
        success={success}
        fontSize={fontSize}
        balkenOffset={balkenOffset}
        colorScheme={colorScheme}
        onControlChange={onControlChange}
        balkenGruppenOffset={balkenGruppenOffset}
        sunflowerOffset={sunflowerOffset}
        credit={credit}
        formData={formData}
        generatedImage={generatedImageSrc}
        onAltTextClick={handleAltTextClick}
      >
        {children}
      </SharepicBackendResult>
    );
  };

  const renderFormContent = () => {
    const helpDisplay = helpContent ? (
      <HelpDisplay
        content={helpContent.content}
        tips={helpContent.tips}
      />
    ) : null;

    return (
      <>
        {helpDisplay}
        {(() => {
          switch (currentStep) {
            case FORM_STEPS.INPUT:
              return renderInputStep();
            case FORM_STEPS.PREVIEW:
              return renderPreviewStep();
            case FORM_STEPS.RESULT:
              return renderResultStep();
            default:
              return null;
          }
        })()}
      </>
    );
  };

  const renderDisplayContent = useMemo(() => {
    if (!generatedImageSrc && generatedContent) {
      return <div className="display-content">{generatedContent}</div>;
    }

    return (
      <div className="display-content" style={{ fontSize: fontSize }}>
        {currentStep === FORM_STEPS.PREVIEW && (
          <>
            <div className="preview-image-container">
              {formData.uploadedImage && (
                <img 
                  src={URL.createObjectURL(formData.uploadedImage)} 
                  alt="Vorschau" 
                  className="preview-image"
                />
              )}
              {selectedImage && (
                <img 
                  src={selectedImage.urls.regular} 
                  alt={selectedImage.alt_description || "Unsplash Vorschau"} 
                  className="preview-image"
                />
              )}
            </div>
            {fileUploadProps?.alternativesButtonProps?.isExpanded && formData.sloganAlternatives?.length > 0 && (
              <div className="alternatives-section">
                <h4>Wähle einen passenden Text für dein Sharepic aus</h4>
                <SloganAlternativesDisplay
                  currentSlogan={formData.type === 'Zitat' ? {
                    quote: formData.quote
                  } : formData.type === 'Info' ? {
                    header: formData.header,
                    subheader: formData.subheader,
                    body: formData.body
                  } : {
                    line1: formData.line1,
                    line2: formData.line2,
                    line3: formData.line3
                  }}
                  alternatives={formData.sloganAlternatives}
                  onSloganSelect={formData.type === 'Zitat' ? 
                    (selected) => {
                      handleChange({
                        target: {
                          name: 'quote',
                          value: selected.quote
                        }
                      });
                    } : formData.type === 'Info' ?
                    (selected) => {
                      handleChange({
                        target: {
                          name: 'header',
                          value: selected.header
                        }
                      });
                      handleChange({
                        target: {
                          name: 'subheader',
                          value: selected.subheader
                        }
                      });
                      handleChange({
                        target: {
                          name: 'body',
                          value: selected.body
                        }
                      });
                    } : 
                    fileUploadProps.alternativesButtonProps.onSloganSelect
                  }
                />
              </div>
            )}
          </>
        )}
        {currentStep === FORM_STEPS.RESULT && typeof generatedImageSrc === 'string' && (generatedImageSrc.startsWith('data:image') || generatedImageSrc.startsWith('/api/')) && (
          <>
            <div className="sticky-sharepic-container">
              <img src={generatedImageSrc} alt="Generiertes Sharepic" className="sticky-sharepic" />
              <div className="button-container" style={{ fontSize: 'initial' }}>
                {useDownloadButton && <DownloadButton imageUrl={generatedImageSrc} />}
              </div>
            </div>
            
            {/* Alt Text Inline Section */}
            {showAltTextSection && (
              <div className="alt-text-inline-section" style={{ fontSize: 'initial' }}>
                <div className="alt-text-header">
                  <h3>Alt-Text für Barrierefreiheit</h3>
                  <HelpTooltip>
                    <p>
                      Alt-Text beschreibt Bilder für Menschen mit Sehbehinderung. 
                      Er wird von Screenreadern vorgelesen und macht Inhalte barrierefrei.
                    </p>
                    <p>
                      <a href="https://www.dbsv.org/bildbeschreibung-4-regeln.html" 
                         target="_blank" 
                         rel="noopener noreferrer">
                        DBSV-Richtlinien für Bildbeschreibungen →
                      </a>
                    </p>
                  </HelpTooltip>
                  {generatedAltText && !altTextLoading && (
                    <CopyButton 
                      directContent={generatedAltText}
                      variant="icon"
                      className="alt-text-copy-button"
                    />
                  )}
                </div>
                
                {altTextLoading && (
                  <div className="alt-text-loading">
                    <span className="loading-spinner">⏳</span>
                    <span>Alt-Text wird generiert...</span>
                  </div>
                )}
                
                {altTextError && (
                  <div className="alt-text-error">
                    <span>⚠️</span>
                    <span>Fehler bei der Alt-Text-Generierung: {altTextError}</span>
                  </div>
                )}
                
                {generatedAltText && !altTextLoading && (
                  <div className="alt-text-content">
                    {generatedAltText}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }, [
    currentStep, 
    generatedImageSrc,
    generatedContent,
    useDownloadButton, 
    fontSize,
    formData,
    selectedImage,
    showAltTextSection,
    altTextLoading,
    altTextError,
    generatedAltText
  ]);

  return (
    <div className={`sharepic-base-container ${generatedContent ? 'with-content' : ''} ${currentStep === FORM_STEPS.RESULT ? 'result-step' : ''}`}>
      <div className={`form-container form-card form-card--elevated form-card--large`}>
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}>
          <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
            {renderFormContent()}
          </div>
        </form>
      </div>
      <div className="display-container">
        <h3>{helpContent?.title || title}</h3>
        {error && (
          <p role="alert" aria-live="assertive" className="error-message">{error}</p>
        )}
        {Object.keys(formErrors).length > 0 && <FormErrors errors={formErrors} />}
        {renderDisplayContent}
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
  fileUploadProps: PropTypes.shape({
    loading: PropTypes.bool,
    file: PropTypes.object,
    handleChange: PropTypes.func,
    error: PropTypes.string,
    allowedTypes: PropTypes.arrayOf(PropTypes.string),
    buttonText: PropTypes.string,
    unsplashButtonText: PropTypes.string,
    showAlternativesButton: PropTypes.bool,
    alternativesButtonProps: PropTypes.shape({
      isExpanded: PropTypes.bool,
      onClick: PropTypes.func,
      onSloganSelect: PropTypes.func
    })
  }),
  useDownloadButton: PropTypes.bool,
  showBackButton: PropTypes.bool,
  submitButtonText: PropTypes.string,
  fontSize: PropTypes.number.isRequired,
  balkenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  colorScheme: PropTypes.arrayOf(PropTypes.shape({
    background: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })).isRequired,
  onControlChange: PropTypes.func.isRequired,
  isSubmitting: PropTypes.bool,
  currentSubmittingStep: PropTypes.oneOf(Object.values(FORM_STEPS)),
  balkenGruppenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  sunflowerOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  credit: PropTypes.string,
  helpContent: PropTypes.shape({
    title: PropTypes.string,
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  })
};

export default BaseForm;