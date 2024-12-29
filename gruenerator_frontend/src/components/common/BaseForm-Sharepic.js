import React, { useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { HiCog, HiChevronDown, HiChevronUp } from "react-icons/hi";
import Button from './SubmitButton';
import DownloadButton from './DownloadButton';
import FileUpload from '../utils/FileUpload';
import UnsplashButton from './UnsplashButton';
import { useSharepicGeneratorContext } from '../utils/Sharepic/SharepicGeneratorContext';
import AdvancedEditingSection from './AdvancedEditingSection';
import HelpDisplay from './HelpDisplay';
import '../../assets/styles/pages/baseform.css';
import '../../assets/styles/components/button.css';
import '../../assets/styles/components/sharepic.css';
import FormErrors from './FormErrors';

import { 
  ColorSchemeControl, 
  FontSizeControl, 
  CreditControl,
} from '../utils/ImageModificationForm';
import { 
  BUTTON_LABELS, 
  ARIA_LABELS, 
  FORM_STEPS,
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
  helpContent,
}) => {
  const { 
    state: { 
      currentStep, 
      isLottieVisible, 
      generatedImageSrc,
      isAdvancedEditingOpen,
      formData: { fontSize: textSize, thema, details }
    },
    toggleAdvancedEditing,
  } = useSharepicGeneratorContext();  

  useEffect(() => {
    console.log('BaseForm: Current step changed to', currentStep);
  }, [currentStep]);

  useEffect(() => {
    console.log('BaseForm props update:', {
      currentStep,
      isSubmitting,
      currentSubmittingStep,
      isLottieVisible,
    });
  }, [currentStep, isSubmitting, currentSubmittingStep, isLottieVisible]);

  useEffect(() => {
    if (isAdvancedEditingOpen) {
      const advancedSection = document.querySelector('.advanced-editing-section');
      if (advancedSection) {
        advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [isAdvancedEditingOpen]);

  const formButtons = useMemo(() => ({
    showBack: showBackButton,
    submitText: submitButtonText,
    loading,
    success
  }), [showBackButton, submitButtonText, loading, success]);

  const renderFormButtons = () => (
    <div className="upload-and-search-container">
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
      {renderFormButtons()}
    </div>
  );

  const renderPreviewStep = () => {
    const { state: { formData } } = useSharepicGeneratorContext();
    return (
      <>
        <div className="input-fields-wrapper">
          {children}
        </div>
        <div className="upload-and-search-container">
          <div className="file-upload-wrapper">
            <FileUpload {...fileUploadProps} />
          </div>
          <UnsplashButton 
            searchTerms={[formData.searchTerms?.[0] || formData.thema].filter(Boolean)}
          />
        </div>
        {renderFormButtons()}
      </>
    );
  };

  const handleSocialMediaClick = useCallback(() => {
    const url = new URL(window.location.origin + '/socialmedia');
    url.searchParams.append('thema', thema || '');
    url.searchParams.append('details', details || '');
    window.open(url.toString(), '_blank');
  }, [thema, details]);

  const renderResultStep = () => (
    <>
      <div className="image-modification-controls">
        <div className="left-column">
          <div className="textzeilen-group">
            <h3>Textzeilen</h3>
            <p>Hier änderst du den Text auf dem Bild</p>
            <div className="input-fields-wrapper">
              {children}
            </div>
          </div>
          <div className="absender-group">
            <h3>Absender</h3>
            <p>Du kannst hier optional einen Absender einfügen oder das Feld frei lassen.</p>
            <CreditControl
              credit={credit}
              onControlChange={onControlChange}
            />
          </div>
          <Button
            onClick={onSubmit}
            loading={loading}
            success={success}
            text="Aktualisieren"
            icon={<HiCog />}
            className="form-button"
            ariaLabel={ARIA_LABELS.SUBMIT}
          />
        </div>
        <div className="right-column">
          <div className="farbkombi-group">
            <h3>Farbkombi</h3>
            <p>Wähle eine von vier Farbkombis</p>
            <ColorSchemeControl
              colorScheme={colorScheme}
              onControlChange={onControlChange}
            />
          </div>
          <div className="schriftgroesse-group">
            <h3>Schriftgröße</h3>
            <p>Du kannst mit den Buttons unten drei verschiedene Schriftgrößen wählen. Standard ist M.</p>
            <FontSizeControl
              fontSize={fontSize}
              onControlChange={onControlChange}
            />
          </div>
          <div className="social-media-section">
            <h3>Social Media</h3>
            <p>Erstelle passende Social-Media-Beiträge zu deinem Sharepic.</p>
            <Button
              onClick={handleSocialMediaClick}
              text="Social-Media-Text erstellen"
              className="social-media-button"
              ariaLabel="Social Media Text erstellen"
            />
          </div>
        </div>
      </div>
      <div className="advanced-editing-button-container">
        <Button
          text={isAdvancedEditingOpen ? "Erweiterte Bildbearbeitung schließen" : "Erweiterte Bildbearbeitung"}
          className={`advanced-editing-button ${isAdvancedEditingOpen ? 'open' : ''}`}
          onClick={handleAdvancedEditingClick}
          icon={isAdvancedEditingOpen ? <HiChevronUp /> : <HiChevronDown />}
        />
      </div>
    </>
  );

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
    const { 
      state: { 
        formData,
        selectedImage 
      }
    } = useSharepicGeneratorContext();

    if (!generatedImageSrc && generatedContent) {
      return <div className="display-content">{generatedContent}</div>;
    }

    return (
      <div className="display-content" style={{ fontSize: textSize }}>
        {currentStep === FORM_STEPS.PREVIEW && (
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
        )}
        {currentStep === FORM_STEPS.RESULT && typeof generatedImageSrc === 'string' && generatedImageSrc.startsWith('data:image') && (
          <div className="sticky-sharepic-container">
            <img src={generatedImageSrc} alt="Generiertes Sharepic" className="sticky-sharepic" />
            <div className="button-container">
              {useDownloadButton && <DownloadButton imageUrl={generatedImageSrc} />}
            </div>
          </div>
        )}
      </div>
    );
  }, [
    currentStep, 
    generatedImageSrc,
    generatedContent,
    useDownloadButton, 
    textSize
  ]);

  const handleAdvancedEditingClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleAdvancedEditing();
  }, [toggleAdvancedEditing]);

  return (
    <div className={`base-container ${generatedContent ? 'with-content' : ''} ${currentStep === FORM_STEPS.RESULT ? 'result-step' : ''}`}>
      <div className="form-container">
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}>
          <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
            {renderFormContent()}
            <FormErrors errors={formErrors} />
          </div>
          {currentStep === FORM_STEPS.RESULT && (
            <>
              {isAdvancedEditingOpen && (
                <div className="advanced-controls-container">
                  <AdvancedEditingSection
                    balkenOffset={balkenOffset}
                    balkenGruppenOffset={balkenGruppenOffset}
                    sunflowerOffset={sunflowerOffset}
                    onBalkenOffsetChange={(newOffset) => onControlChange('balkenOffset', newOffset)}
                    onBalkenGruppenOffsetChange={(newOffset) => onControlChange('balkenGruppenOffset', newOffset)}
                    onSonnenblumenOffsetChange={(newOffset) => onControlChange('sunflowerOffset', newOffset)}
                  />
                </div>
              )}
            </>
          )}
        </form>
        {error && <p role="alert" aria-live="assertive" className="error-message">{error}</p>}
      </div>
      <div className="content-container">
        <div className="display-container">
          <h3>{helpContent?.title || title}</h3>
          {renderDisplayContent}
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
  fileUploadProps: PropTypes.shape({
    loading: PropTypes.bool,
    file: PropTypes.object,
    handleChange: PropTypes.func,
    error: PropTypes.string,
    allowedTypes: PropTypes.arrayOf(PropTypes.string)
  }).isRequired,
  helpContent: PropTypes.shape({
    title: PropTypes.string,
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
};

export default BaseForm;