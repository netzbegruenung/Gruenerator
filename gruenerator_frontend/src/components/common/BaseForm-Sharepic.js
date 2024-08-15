import React, { useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import Button from './Button';
import DownloadButton from './DownloadButton';
import GeneratePostButton from './GeneratePostButton';
import FormErrors from './FormErrors';
import GeneratedPostContainer from './GeneratedPostContainer';
import UnsplashImageSelector from '../utils/Unsplash/UnsplashImageSelector';
import ImageSearchBar from './ImageSearchBar';
import FileUpload from '../utils/FileUpload';
import { useSharepicGeneratorContext } from '../utils/Sharepic/SharepicGeneratorContext';
import AdvancedEditingSection from './AdvancedEditingSection';
import '../../assets/styles/pages/baseform.css';
import '../../assets/styles/components/imagemodificator.css';
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
  showGeneratePostButton = false,
  onGeneratePost,
  generatePostLoading,
  generatedPost,
  isSharepicGenerator = false,
  onUnsplashSearch,
  fontSize,
  balkenOffset,
  colorScheme,
  onControlChange,
  isSubmitting,
  currentSubmittingStep,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
}) => {
  const { 
    state: { 
      currentStep, 
      isLottieVisible, 
      unsplashImages, 
      selectedImage,
      generatedImageSrc,
      isAdvancedEditingOpen,
      formData: { fontSize: textSize }
    },
    updateFormData,
    toggleAdvancedEditing,
    FORM_STEPS
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

  const handleUnsplashSelect = useCallback((image) => {
    updateFormData({ selectedImage: image });
  }, [updateFormData]);

  const renderInputStep = useMemo(() => (
    <div className="input-fields-wrapper">
      {children}
    </div>
  ), [children]);

  const renderPreviewStep = useMemo(() => (
    <>
      <div className="input-fields-wrapper">
        {children}
      </div>
      <div className="upload-and-search-container">
        <FileUpload {...fileUploadProps} />
        <ImageSearchBar onSearch={onUnsplashSearch} />
      </div>
    </>
  ), [children, fileUploadProps, onUnsplashSearch]);

  const renderResultStep = useMemo(() => (
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
          <p>Du kannst hier optional einen Absender einfügen</p>
          <CreditControl
            credit={credit}
            onControlChange={onControlChange}
          />
        </div>
        <Button
          onClick={onSubmit}
          loading={loading}
          success={success}
          text="Text aktualisieren"
          icon={<HiCog />}
          className="submit-button form-button"
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
          <p>Passe die Größe der Schrift an</p>
          <FontSizeControl
            fontSize={fontSize}
            onControlChange={onControlChange}
          />
        </div>
        <div className="Beitragstext-group">
          <h3>Beitragstext</h3>
          <p>Wenn du noch einen Beitragstext brauchst, kannst du hier einen erstellen.</p>
          <Button
          text="Beitragstext"
          className="post-text-button"
          onClick={onGeneratePost}
        />
        </div>
      </div>
      <div className="button-container">

      </div>
      <Button
        text="Erweiterte Bildbearbeitung"
        className="advanced-editing-button"
        onClick={toggleAdvancedEditing}
      />
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
    </div>
  ), [children, credit, colorScheme, fontSize, onControlChange, onSubmit, loading, success, onGeneratePost, toggleAdvancedEditing, isAdvancedEditingOpen, balkenOffset, balkenGruppenOffset, sunflowerOffset]);
  const renderFormContent = useMemo(() => {
    switch (currentStep) {
      case FORM_STEPS.INPUT:
        return renderInputStep;
      case FORM_STEPS.PREVIEW:
        return renderPreviewStep;
      case FORM_STEPS.RESULT:
        return renderResultStep;
      default:
        return null;
    }
  }, [currentStep, renderInputStep, renderPreviewStep, renderResultStep]);

  const renderButtons = useMemo(() => (
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
  ), [showBackButton, onBack, onSubmit, loading, success, submitButtonText]);

  const renderDisplayContent = useMemo(() => (
    <div className="display-content" style={{ fontSize: textSize }}>
      {currentStep === FORM_STEPS.RESULT && typeof generatedImageSrc === 'string' && generatedImageSrc.startsWith('data:image') && (
        <>
          <img src={generatedImageSrc} alt="Generiertes Sharepic" style={{ maxWidth: '100%' }} />
          <div className="button-container">
            {useDownloadButton && <DownloadButton imageUrl={generatedImageSrc} />}
            {showGeneratePostButton && !generatedPost && (
              <GeneratePostButton onClick={onGeneratePost} loading={generatePostLoading} />
            )}
          </div>
        </>
      )}
      {currentStep === FORM_STEPS.PREVIEW && Array.isArray(unsplashImages) && unsplashImages.length > 0 && (
        <UnsplashImageSelector 
          onSelect={handleUnsplashSelect} 
          selectedImage={selectedImage}
          images={unsplashImages}
        />
      )}
      {currentStep === FORM_STEPS.RESULT && (
        <GeneratedPostContainer
          post={generatedPost}
          onGeneratePost={onGeneratePost}
          generatePostLoading={generatePostLoading}
          isSharepicGenerator={isSharepicGenerator}
        />
      )}
    </div>
  ), [currentStep, generatedImageSrc, useDownloadButton, showGeneratePostButton, generatedPost, onGeneratePost, generatePostLoading, unsplashImages, handleUnsplashSelect, selectedImage, isSharepicGenerator, textSize]);

  return (
    <div className={`base-container ${generatedContent ? 'with-content' : ''} ${currentStep === FORM_STEPS.RESULT ? 'result-step' : ''}`}>
      <div className="container">
        <div className="form-container">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!e.target.closest('.image-search-form')) {
              onSubmit();
            }
          }}>
            <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
              {renderFormContent}
              <FormErrors errors={formErrors} />
              {renderButtons}
            </div>
          </form>
          {error && <p role="alert" aria-live="assertive" className="error-message">{error}</p>}
        </div>
        <div className="display-container">
          <h3>{title}</h3>
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
  showGeneratePostButton: PropTypes.bool,
  onGeneratePost: PropTypes.func,
  generatePostLoading: PropTypes.bool,
  generatedPost: PropTypes.string,
  isSharepicGenerator: PropTypes.bool,
  fileUploadProps: PropTypes.object.isRequired,
  onUnsplashSearch: PropTypes.func,
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
};

export default BaseForm;