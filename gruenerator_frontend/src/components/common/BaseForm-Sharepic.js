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
import '../../assets/styles/components/advanced-editing.css';
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
import { SloganAlternativesButton } from './SloganAlternatives';

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
      formData,
      selectedImage
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
      {renderFormButtons()}
    </div>
  );

  const renderPreviewStep = () => {
    return (
      <>
        <div className="input-fields-wrapper">
          {children}
        </div>
        <div className="action-buttons three-buttons">
          <div className="button-wrapper">
            <SloganAlternativesButton {...fileUploadProps.alternativesButtonProps} buttonText="Anderer Slogan" />
          </div>
          <div className="button-wrapper">
            <FileUpload {...fileUploadProps} buttonText="Upload" />
          </div>
          <div className="button-wrapper">
            <UnsplashButton 
              searchTerms={formData.searchTerms}
            />
          </div>
        </div>
        <div className="button-container">
          {renderFormButtons()}
        </div>
      </>
    );
  };

  const handleSocialMediaClick = useCallback(() => {
    const url = new URL(window.location.origin + '/socialmedia');
    url.searchParams.append('thema', formData.thema || '');
    url.searchParams.append('details', formData.details || '');
    window.open(url.toString(), '_blank');
  }, [formData]);

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
          <div className="color-controls">
            <h3>Farbschema</h3>
            <p>Wähle eine von vier Farbkombinationen für dein Sharepic.</p>
            <ColorSchemeControl
              colorScheme={colorScheme}
              onControlChange={onControlChange}
            />
          </div>
          <div className="font-size-group">
            <h3>Schriftgröße</h3>
            <p>Passe die Größe des Textes auf deinem Sharepic an.</p>
            <FontSizeControl
              fontSize={fontSize}
              onControlChange={onControlChange}
            />
          </div>
          <div className="social-media-group">
            <h3>Social Media</h3>
            <p>Erstelle passende Beitragstexte für deine Social-Media-Kanäle.</p>
            <Button
              onClick={handleSocialMediaClick}
              text="Beitragstext erstellen"
              className="social-media-button"
              ariaLabel={ARIA_LABELS.SOCIAL_MEDIA}
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
    if (!generatedImageSrc && generatedContent) {
      return <div className="display-content">{generatedContent}</div>;
    }

    return (
      <div className="display-content" style={{ fontSize: fontSize }}>
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
            <div className="button-container" style={{ fontSize: 'initial' }}>
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
    fontSize,
    formData,
    selectedImage
  ]);

  const handleAdvancedEditingClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleAdvancedEditing();
  }, [toggleAdvancedEditing]);

  return (
    <div className={`sharepic-base-container ${generatedContent ? 'with-content' : ''} ${currentStep === FORM_STEPS.RESULT ? 'result-step' : ''}`}>
      <div className="form-container">
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}>
          <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
            {renderFormContent()}
            {Object.keys(formErrors).length > 0 && <FormErrors errors={formErrors} />}
          </div>
          {currentStep === FORM_STEPS.RESULT && (
            <>
              {isAdvancedEditingOpen && (
                <AdvancedEditingSection
                  balkenOffset={balkenOffset}
                  balkenGruppenOffset={balkenGruppenOffset}
                  sunflowerOffset={sunflowerOffset}
                  onBalkenOffsetChange={(newOffset) => onControlChange('balkenOffset', newOffset)}
                  onBalkenGruppenOffsetChange={(newOffset) => onControlChange('balkenGruppenOffset', newOffset)}
                  onSonnenblumenOffsetChange={(newOffset) => onControlChange('sunflowerOffset', newOffset)}
                />
              )}
            </>
          )}
        </form>
        {error && !Object.keys(formErrors).length && (
          <p role="alert" aria-live="assertive" className="error-message">{error}</p>
        )}
      </div>
      <div className="display-container">
        <h3>{helpContent?.title || title}</h3>
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
    allowedTypes: PropTypes.arrayOf(PropTypes.string),
    buttonText: PropTypes.string,
    unsplashButtonText: PropTypes.string,
    showAlternativesButton: PropTypes.bool,
    alternativesButtonProps: PropTypes.shape({
      isExpanded: PropTypes.bool,
      onClick: PropTypes.func
    })
  }).isRequired,
  helpContent: PropTypes.shape({
    title: PropTypes.string,
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
};

export default BaseForm;