// SharepicGeneratorneu
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { SharepicGeneratorProvider, useSharepicGeneratorContext } from '../../utils/Sharepic/SharepicGeneratorContext';
import { useSharepicGeneration } from '../../hooks/sharepic/useSharepicGeneration';
import { useSharepicRendering } from '../../hooks/sharepic/useSharepicRendering';
import BaseForm from '../../common/BaseForm-Sharepic';
import ErrorBoundary from '../../ErrorBoundary';
import { useGenerateSocialPost } from '../../hooks/useGenerateSocialPost';
import { createImageFormData, processImageForUpload } from '../../utils/imageCompression';

import { 
  FORM_STEPS, 
  BUTTON_LABELS, 
  SHAREPIC_GENERATOR, 
  ERROR_MESSAGES, 
} from '../../utils/constants';

function SharepicGeneratorContent({ showHeaderFooter = true, darkMode }) {
  const { 
    state, 
    setFile,
    setError, 
    updateFormData, 
    handleUnsplashSearch, 
    fetchFullSizeImage, 
    triggerDownload,
    modifyImage,
    setLottieVisible, 

  } = useSharepicGeneratorContext();

  const { generateText, generateImage, loading: generationLoading, error: generationError } = useSharepicGeneration();

  const { renderFormFields } = useSharepicRendering();
  const [errors, setErrors] = useState({}); 
  const [searchQuery, setSearchQuery] = useState('');

  const { generatePost, loading: generatePostLoading, error: generatePostError } = useGenerateSocialPost();
const [generatedPosts, setGeneratedPosts] = useState({});
const [platforms, setPlatforms] = useState({
  facebook: false,
  instagram: false,
  twitter: false,
  linkedin: false,
  actionIdeas: false
});

const handlePlatformChange = useCallback((platform) => {
  setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
}, []);

const handleGeneratePost = useCallback(async () => {
  const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key] && key !== 'actionIdeas');
  const includeActionIdeas = platforms.actionIdeas;
  
  try {
    const newPosts = await generatePost(state.formData.thema, state.formData.details, selectedPlatforms, includeActionIdeas);
    if (newPosts) {
      setGeneratedPosts(newPosts);
      updateFormData({ generatedPosts: newPosts });
    }
  } catch (error) {
    console.error('Fehler beim Generieren der Posts:', error);
    // Hier könnten Sie einen Fehlerzustand setzen oder eine Benachrichtigung anzeigen
  }
}, [generatePost, state.formData, platforms, updateFormData]);

  const validateForm = useCallback((formData) => {
    const newErrors = {};
    if (!formData.thema) newErrors.thema = ERROR_MESSAGES.THEMA;
    if (!formData.type) newErrors.type = ERROR_MESSAGES.TYPE;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, []);

  useEffect(() => {
    console.log('SharepicGenerator: Current step:', state.currentStep);
    console.log('SharepicGenerator: Generated image src:', state.generatedImageSrc);
    console.log('SharepicGenerator: Form data:', state.formData);
  }, [state.currentStep, state.generatedImageSrc, state.formData]);

  const handleUnsplashSelect = useCallback((selectedImage) => {
    console.log('Selected Unsplash image:', selectedImage);
    updateFormData({ selectedImage });
  }, [updateFormData]);

  const uploadAndProcessFile = useCallback(async (file) => {
    if (!file) {
      setError('Keine Datei ausgewählt');
      return null;
    }

    updateFormData({ loading: true });
    setError(null);

    try {
      const formData = await createImageFormData(file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Netzwerkfehler beim Upload: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fehler beim Upload:', error);
      setError(error.message);
      return null;
    } finally {
      updateFormData({ loading: false });
    }
  }, [setError, updateFormData]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    updateFormData({ [name]: value });
  }, [updateFormData]);

  const handleFormSubmit = useCallback(async (event) => {
    console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.FORM_SUBMISSION_STARTED);
    if (event) event.preventDefault();
    
    updateFormData({ loading: true });
    
    try {
      if (!validateForm(state.formData)) {
        throw new Error(ERROR_MESSAGES.FORM_VALIDATION_FAILED);
      }
  
      if (state.currentStep === FORM_STEPS.INPUT) {
        console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.GENERATING_TEXT, state.currentStep);
        setLottieVisible(true); // Lottie sichtbar machen
        const result = await generateText(state.formData.type, { 
          thema: state.formData.thema, 
          details: state.formData.details 
        });
        
        if (!result) throw new Error(ERROR_MESSAGES.NO_TEXT_DATA);
        
        console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.TEXT_GENERATED);
        await updateFormData({ 
          ...result, 
          type: state.formData.type, 
          currentStep: FORM_STEPS.PREVIEW 
        });
        console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.FORM_DATA_UPDATED, FORM_STEPS.PREVIEW);
  
  
      } else if (state.currentStep === FORM_STEPS.PREVIEW) {
        let fileToUse = state.formData.uploadedImage;
        
        try {
          if (!fileToUse && state.selectedImage) {
            const fullSizeImage = await fetchFullSizeImage(state.selectedImage.fullImageUrl);
            fileToUse = await processImageForUpload(fullSizeImage);
            await updateFormData({ uploadedImage: fileToUse });
            await triggerDownload(state.selectedImage.downloadLocation);
          } else if (state.file) {
            const uploadedFile = await uploadAndProcessFile(state.file);
            if (!uploadedFile) throw new Error("Fehler beim Hochladen der Datei");
            fileToUse = uploadedFile;
            await updateFormData({ uploadedImage: fileToUse });
          }

          if (!fileToUse) throw new Error("Bitte wählen Sie ein Bild aus");

  
          const imageResult = await generateImage({ ...state.formData, image: fileToUse });
          console.log('Generated image result:', imageResult);
  
          if (!imageResult) throw new Error("Keine Bilddaten empfangen");
  
          await updateFormData({ 
            generatedImageSrc: imageResult, 
            currentStep: FORM_STEPS.RESULT
          });
  
        } catch (error) {
          console.error('Error in handleFormSubmit:', error);
          setError(error.message);
        }
      } else if (state.currentStep === FORM_STEPS.RESULT) {
        const { fontSize, balkenOffset, colorScheme, credit } = state.formData;
        try {
          console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.MODIFYING_IMAGE, { fontSize, balkenOffset, colorScheme });
          const modifiedImage = await modifyImage({ fontSize, balkenOffset, colorScheme, credit });
          console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.IMAGE_MODIFIED);
          
          if (!modifiedImage) {
            throw new Error(ERROR_MESSAGES.NO_MODIFIED_IMAGE_DATA);
          }
          
          await updateFormData({ 
            generatedImageSrc: modifiedImage,
            fontSize,
            balkenOffset,
            colorScheme,
            credit
          });
        } catch (error) {
          console.error('Error in modifyImage:', error);
          setError(`${ERROR_MESSAGES.NETWORK_ERROR}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Error in form submission:', error);
      setError(error.message);
    } finally {
      updateFormData({ loading: false });

    }
  }, [
    state.currentStep, 
    state.formData,
    validateForm,
    generateText,
    generateImage,
    modifyImage,
    updateFormData,
    setError,
    setLottieVisible, // Lottie-Sichtbarkeitssteuerung über den Kontext

  ]);

  useEffect(() => {
    console.log('SharepicGenerator state update:', {
      currentStep: state.currentStep,
      isSubmitting: state.isSubmitting,
      currentSubmittingStep: state.currentSubmittingStep,
      isLottieVisible: state.isLottieVisible,
    });
  }, [state.currentStep, state.isSubmitting, state.currentSubmittingStep, state.isLottieVisible]);
  
  const handleBack = useCallback(() => {
    if (state.currentStep === FORM_STEPS.RESULT) {
      if (window.confirm("Möchtest du wirklich zurück zum ersten Schritt? Das generierte Sharepic geht verloren.")) {
        updateFormData({ 
          currentStep: FORM_STEPS.INPUT, 
          generatedImageSrc: '', 
          uploadedImage: null 
        });
      }
    } else if (state.currentStep === FORM_STEPS.PREVIEW) {
      updateFormData({ 
        currentStep: FORM_STEPS.INPUT, 
        uploadedImage: null 
      });
    } else if (state.currentStep > FORM_STEPS.INPUT) {
      updateFormData({ currentStep: state.currentStep - 1 });
    }
  }, [state.currentStep, updateFormData]);

    
  const handleFileChange = useCallback(async (selectedFile) => {
    try {
      if (selectedFile) {
        const processedFile = await processImageForUpload(selectedFile);
        setFile(processedFile);
        updateFormData({ uploadedImage: processedFile });
      }
    } catch (error) {
      console.error('Fehler bei der Bildverarbeitung:', error);
      setError(error.message);
    }
  }, [setFile, updateFormData, setError]);
  

  useEffect(() => {
    console.log('SharepicGenerator: Current step:', state.currentStep);
    console.log('SharepicGenerator: Form data:', state.formData);
  }, [state.currentStep, state.generatedImageSrc, state.formData]);
  
  useEffect(() => {
    if (state.currentStep === FORM_STEPS.PREVIEW && state.formData.searchTerms?.length > 0) {
      const newQuery = state.formData.searchTerms.join(' ');
      if (newQuery !== searchQuery) {
        setSearchQuery(newQuery);
        handleUnsplashSearch(newQuery);
      }
    }
  }, [state.currentStep, state.formData.searchTerms, searchQuery, handleUnsplashSearch]);

  const handleControlChange = useCallback((name, value) => {
    console.log(`Handling control change: ${name}`, value);
    if (name === 'balkenOffset' && !Array.isArray(value)) {
      console.warn('Invalid balkenOffset value:', value);
      // Verwende den aktuellen Wert oder einen Standardwert
      value = Array.isArray(state.formData.balkenOffset) 
        ? state.formData.balkenOffset 
        : SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET;
    }
    updateFormData({ [name]: value });
  }, [state.formData.balkenOffset, updateFormData]);

  const submitButtonText = useMemo(() => 
    state.currentStep === FORM_STEPS.INPUT ? BUTTON_LABELS.GENERATE_TEXT :
    state.currentStep === FORM_STEPS.PREVIEW ? BUTTON_LABELS.GENERATE_IMAGE :
    BUTTON_LABELS.MODIFY_IMAGE,
  [state.currentStep]);

  const memoizedFormFields = useMemo(() => {
    console.log('Rendering memoizedFormFields for step:', state.currentStep);
    const fields = renderFormFields(state.currentStep, state.formData, handleChange, errors);
    return fields;
  }, [state.currentStep, state.formData, handleChange, errors, renderFormFields]);

  const fileUploadProps = {
    loading: state.loading,
    file: state.file,
    handleChange: handleFileChange,
    error: state.error,
    allowedTypes: SHAREPIC_GENERATOR.ALLOWED_FILE_TYPES,
    selectedUnsplashImage: state.selectedImage,
  };

  return (
    <ErrorBoundary>
      <div
        className={`container ${showHeaderFooter ? 'with-header' : ''} ${darkMode ? 'dark-mode' : ''}`}
        role="main"
        aria-label="Sharepic Generator"
      >
       <BaseForm
    title={SHAREPIC_GENERATOR.TITLE}
    onSubmit={handleFormSubmit}
    onBack={handleBack}
    loading={state.loading || generationLoading}
    error={state.error || generationError}
    generatedContent={state.generatedImageSrc}
    useDownloadButton={state.currentStep === FORM_STEPS.RESULT}
    showBackButton={state.currentStep > FORM_STEPS.INPUT}
    submitButtonText={submitButtonText}
    isSharepicGenerator={true}
    onUnsplashSearch={handleUnsplashSearch}
    currentStep={state.currentStep}
    isLottieVisible={state.isLottieVisible}    
    onUnsplashSelect={handleUnsplashSelect}
    formErrors={errors}
    isSubmitting={state.isSubmitting}
    currentSubmittingStep={state.currentSubmittingStep}
    credit={state.formData.credit}
    onGeneratePost={handleGeneratePost}
    generatePostLoading={generatePostLoading}
    generatePostError={generatePostError}
    generatedPosts={generatedPosts}
    platforms={platforms}
    onPlatformChange={handlePlatformChange}
    includeActionIdeas={platforms.actionIdeas}
    fileUploadProps={fileUploadProps}
    fontSize={state.formData.fontSize || SHAREPIC_GENERATOR.DEFAULT_FONT_SIZE}
  balkenOffset={state.formData.balkenOffset || SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET}
  colorScheme={state.formData.colorScheme || SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME}
  balkenGruppenOffset={state.formData.balkenGruppenOffset || [0, 0]}
        sunflowerOffset={state.formData.sunflowerOffset || [0, 0]}
        onControlChange={handleControlChange}
        >
    {memoizedFormFields}
  </BaseForm>
      </div>
    </ErrorBoundary>
  );

}

SharepicGeneratorContent.propTypes = {
  showHeaderFooter: PropTypes.bool,
  darkMode: PropTypes.bool,
};

export default function SharepicGenerator(props) {
  return (
    <SharepicGeneratorProvider>
      <SharepicGeneratorContent {...props} />
    </SharepicGeneratorProvider>
  );
}