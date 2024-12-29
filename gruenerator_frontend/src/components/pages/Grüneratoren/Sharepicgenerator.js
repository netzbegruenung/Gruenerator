// SharepicGeneratorneu
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { SharepicGeneratorProvider, useSharepicGeneratorContext } from '../../utils/Sharepic/SharepicGeneratorContext';
import { useSharepicGeneration } from '../../hooks/sharepic/useSharepicGeneration';
import { useSharepicRendering } from '../../hooks/sharepic/useSharepicRendering';
import BaseForm from '../../common/BaseForm-Sharepic';
import WelcomePage from '../../common/WelcomePage';
import ErrorBoundary from '../../ErrorBoundary';
import { processImageForUpload } from '../../utils/imageCompression';
import HelpDisplay from '../../common/HelpDisplay';

import { 
  FORM_STEPS, 
  BUTTON_LABELS, 
  SHAREPIC_GENERATOR, 
  ERROR_MESSAGES, 
} from '../../utils/constants';

const getHelpContent = (step) => {
  switch (step) {
    case FORM_STEPS.INPUT:
      return {
        title: "Thema des Sharepics",
        content: "Beschreibe dein Thema und gib Details an. Die KI wird dir einen passenden Textvorschlag generieren.",
        tips: [
          "Je konkreter dein Thema, desto besser der generierte Text",
          "Füge Details hinzu, um den Text noch spezifischer zu machen",
          "KI fügt automatisch einen Suchbegriff für ein passendes Unsplash-Hintergrundbild hinzu"
        ]
      };
    case FORM_STEPS.PREVIEW:
      return {
        title: "Bildauswahl",
        content: "Wähle ein passendes Bild für dein Sharepic aus. Du kannst entweder ein eigenes Bild hochladen oder ein Bild aus der Unsplash-Bibliothek verwenden.",
        tips: [
          "Tippe auf den Unsplash-Button, um ein passendes Bild aus der Unsplash-Bibliothek zu finden",
          "Lade das Unsplash-Bild herunter und dann hier hoch, um es zu verwenden",
          "Die Suchbegriffe sind manchmal Quark, suche dann einfach nach Alternativen"
        ]
      };
    default:
      return null;
  }
};

function SharepicGeneratorContent({ showHeaderFooter = true, darkMode }) {
  const { 
    state, 
    setFile,
    setError, 
    updateFormData, 
    modifyImage,
    setLottieVisible, 
  } = useSharepicGeneratorContext();

  const { generateText, generateImage, loading: generationLoading, error: generationError } = useSharepicGeneration();

  const { renderFormFields } = useSharepicRendering();
  const [errors, setErrors] = useState({});

  const validateForm = useCallback((formData) => {
    const newErrors = {};
    if (!formData.thema) newErrors.thema = ERROR_MESSAGES.THEMA;
    if (!formData.type) newErrors.type = ERROR_MESSAGES.TYPE;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, []);

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
        try {
          if (!state.file) {
            throw new Error("Bitte wählen Sie ein Bild aus");
          }

          const imageResult = await generateImage({ 
            ...state.formData,
            image: state.file
          });

          if (!imageResult) {
            throw new Error("Keine Bilddaten empfangen");
          }

          await updateFormData({ 
            generatedImageSrc: imageResult, 
            currentStep: FORM_STEPS.RESULT
          });
        } catch (error) {
          console.error('Error in image processing:', error);
          setError(error.message);
        }
      } else if (state.currentStep === FORM_STEPS.RESULT) {
        const { fontSize, balkenOffset, colorScheme, credit, uploadedImage, image } = state.formData;
        try {
          console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.MODIFYING_IMAGE, { 
            fontSize, 
            balkenOffset, 
            colorScheme,
            hasImage: !!(uploadedImage || image),
            imageType: uploadedImage ? 'uploadedImage' : image ? 'image' : 'none'
          });

          // Stelle sicher, dass wir das ursprüngliche Bild verwenden
          const imageToUse = uploadedImage || image || state.file;
          
          if (!imageToUse) {
            throw new Error("Kein Bild zum Modifizieren gefunden");
          }

          const modifiedImage = await modifyImage({ 
            fontSize, 
            balkenOffset, 
            colorScheme, 
            credit,
            image: imageToUse
          });
          
          console.log(SHAREPIC_GENERATOR.LOG_MESSAGES.IMAGE_MODIFIED);
          
          if (!modifiedImage) {
            throw new Error(ERROR_MESSAGES.NO_MODIFIED_IMAGE_DATA);
          }
          
          await updateFormData({ 
            generatedImageSrc: modifiedImage,
            fontSize,
            balkenOffset,
            colorScheme,
            credit,
            image: imageToUse // Behalte das Bild im Zustand
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
    setLottieVisible,
    state.file,
    state.selectedImage,
    processImageForUpload,
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
        console.log('Processing file:', selectedFile);
        setFile(selectedFile);
        const processedFile = await processImageForUpload(selectedFile);
        console.log('Processed file:', {
          type: processedFile.type,
          size: processedFile.size,
          isBlob: processedFile instanceof Blob,
          isFile: processedFile instanceof File
        });
        
        // Konvertiere Blob zu File wenn nötig
        const imageFile = processedFile instanceof File ? processedFile : 
          new File([processedFile], selectedFile.name || 'image.jpg', { 
            type: processedFile.type || 'image/jpeg' 
          });

        // Speichere das Bild sowohl als file als auch als uploadedImage
        updateFormData({ 
          uploadedImage: imageFile,
          image: imageFile // Backup-Speicherung
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setError(`Fehler bei der Bildverarbeitung: ${error.message}`);
    }
  }, [setFile, updateFormData, setError]);
  

  useEffect(() => {
    console.log('SharepicGenerator: Current step:', state.currentStep);
    console.log('SharepicGenerator: Form data:', state.formData);
  }, [state.currentStep, state.generatedImageSrc, state.formData]);
  
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
    allowedTypes: SHAREPIC_GENERATOR.ALLOWED_FILE_TYPES
  };

  useEffect(() => {
    console.log('SharepicGenerator Zustand:', {
      file: state.file,
      uploadedImage: state.formData.uploadedImage,
      selectedImage: state.selectedImage,
      currentStep: state.currentStep,
      error: state.error
    });
  }, [state.file, state.formData.uploadedImage, state.selectedImage, state.currentStep, state.error]);

  const helpContent = getHelpContent(state.currentStep);
  const helpDisplay = helpContent ? (
    <HelpDisplay
      content={helpContent.content}
      tips={helpContent.tips}
    />
  ) : null;

  if (state.currentStep === FORM_STEPS.WELCOME) {
    return (
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <WelcomePage
          title="Sharepic-Grünerator"
          description="Erstelle professionelle Sharepics für Social Media. Die KI hilft dir dabei, deine Botschaft optimal zu präsentieren."
          steps={[
            {
              title: "Thema & Text",
              description: "Gib dein Thema ein und lass die KI einen passenden Text generieren."
            },
            {
              title: "Bild auswählen",
              description: "Wähle ein passendes Bild aus oder lade dein eigenes hoch."
            },
            {
              title: "Design anpassen",
              description: "Passe Farben, Schriftgröße und Layout nach deinen Wünschen an."
            }
          ]}
          onStart={() => updateFormData({ currentStep: FORM_STEPS.INPUT })}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className={`container ${showHeaderFooter ? 'with-header' : ''} ${darkMode ? 'dark-mode' : ''}`}
        role="main"
        aria-label="Sharepic Generator"
      >
       <BaseForm
        title={helpContent ? helpContent.title : SHAREPIC_GENERATOR.TITLE}
        onSubmit={handleFormSubmit}
        onBack={handleBack}
        loading={state.loading || generationLoading}
        error={state.error || generationError}
        generatedContent={state.generatedImageSrc || helpDisplay}
        useDownloadButton={state.currentStep === FORM_STEPS.RESULT}
        showBackButton={state.currentStep > FORM_STEPS.INPUT}
        submitButtonText={submitButtonText}
        currentStep={state.currentStep}
        isLottieVisible={state.isLottieVisible}    
        formErrors={errors}
        isSubmitting={state.isSubmitting}
        currentSubmittingStep={state.currentSubmittingStep}
        credit={state.formData.credit}
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