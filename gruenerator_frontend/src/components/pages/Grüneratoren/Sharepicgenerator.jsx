// SharepicGeneratorneu
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { SharepicGeneratorProvider, useSharepicGeneratorContext } from '../../../features/sharepic/core/utils/SharepicGeneratorContext';
import { useSharepicGeneration } from '../../../features/sharepic/core/hooks/useSharepicGeneration';
import { useSharepicRendering } from '../../../features/sharepic/core/hooks/useSharepicRendering';
import BaseForm from '../../../features/sharepic/core/components/BaseForm-Sharepic';
import WelcomePage from '../../common/WelcomePage';
import ErrorBoundary from '../../ErrorBoundary';
import { processImageForUpload } from '../../../components/utils/imageCompression';
import HelpDisplay from '../../common/HelpDisplay';
import VerifyFeature from '../../common/VerifyFeature';
import { SloganAlternativesDisplay } from '../../../features/sharepic/core/components/SloganAlternatives';
import '../../../assets/styles/components/slogan-alternatives.css';
import SharepicTypeSelector from '../../../features/sharepic/core/components/SharepicTypeSelector';

import { 
  FORM_STEPS, 
  BUTTON_LABELS, 
  SHAREPIC_GENERATOR, 
  ERROR_MESSAGES, 
} from '../../utils/constants';

const getHelpContent = (step, showingAlternatives = false) => {
  switch (step) {
    case FORM_STEPS.INPUT:
      return {
        title: "Thema des Sharepics",
        content: "Beschreibe dein Thema und gib Details an. Die KI wird dir passende Textvorschläge generieren.",
        tips: [
          "Je konkreter dein Thema, desto besser die generierten Texte",
          "Füge Details hinzu, um die Texte noch spezifischer zu machen",
          "KI fügt automatisch einen Suchbegriff für ein passendes Unsplash-Hintergrundbild hinzu"
        ]
      };
    case FORM_STEPS.PREVIEW:
      return {
        title: showingAlternatives ? "Text auswählen" : "Bild- und Sloganauswahl",
        content: showingAlternatives 
          ? "Wähle einen passenden Text für dein Sharepic aus."
          : "Wähle ein passendes Bild für dein Sharepic aus und passe den Text an.",
        tips: showingAlternatives 
          ? [] 
          : [
              "Tippe auf den Unsplash-Button, um ein passendes Bild aus der Unsplash-Bibliothek zu finden",
              "Lade das Unsplash-Bild herunter und dann hier hoch, um es zu verwenden",
              "Klicke auf 'Alternativen anzeigen', um weitere Textvorschläge zu sehen",
              "Du kannst den Text in den Eingabefeldern weiter anpassen"
            ]
      };
    default:
      return null;
  }
};

function SharepicGeneratorContent({ showHeaderFooter = true, darkMode }) {
  const [hasSeenWelcome, setHasSeenWelcome] = useState(() => {
    return localStorage.getItem('hasSeenSharepicWelcome') === 'true';
  });

  const { 
    state, 
    setFile,
    setError, 
    updateFormData, 
    modifyImage,
    setLottieVisible, 
    setAlternatives,
    selectSlogan
  } = useSharepicGeneratorContext();

  const { generateText, generateImage, loading: generationLoading, error: generationError } = useSharepicGeneration();

  const { renderFormFields } = useSharepicRendering();
  const [errors, setErrors] = useState({});
  const [showAlternatives, setShowAlternatives] = useState(false);

  useEffect(() => {
    if (hasSeenWelcome && state.currentStep === FORM_STEPS.WELCOME) {
      updateFormData({ currentStep: FORM_STEPS.TYPE_SELECT });
    }
  }, [hasSeenWelcome, state.currentStep, updateFormData]);

  useEffect(() => {
    if (!hasSeenWelcome) {
      localStorage.setItem('hasSeenSharepicWelcome', 'true');
      setHasSeenWelcome(true);
    }
  }, [hasSeenWelcome]);

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
    if (event) event.preventDefault();
    
    updateFormData({ loading: true });
    setError(''); // Reset error state
    
    try {
      if (!validateForm(state.formData)) {
        throw new Error(ERROR_MESSAGES.FORM_VALIDATION_FAILED);
      }
  
      if (state.currentStep === FORM_STEPS.INPUT) {
        setLottieVisible(true);
        const result = await generateText(state.formData.type, { 
          thema: state.formData.thema, 
          details: state.formData.details,
          quote: state.formData.quote,
          name: state.formData.name
        });
        
        if (!result) throw new Error(ERROR_MESSAGES.NO_TEXT_DATA);
        
        if (state.formData.type === 'Zitat') {
          await updateFormData({ 
            ...state.formData,
            quote: result.quote,
            name: result.name || state.formData.name,
            currentStep: FORM_STEPS.PREVIEW,
            sloganAlternatives: result.alternatives || []
          });
          setAlternatives(result.alternatives || []);
        } else {
          await updateFormData({ 
            ...result.mainSlogan,
            type: state.formData.type, 
            currentStep: FORM_STEPS.PREVIEW,
            searchTerms: result.searchTerms,
            sloganAlternatives: result.alternatives || []
          });
          setAlternatives(result.alternatives || []);
        }
      } else if (state.currentStep === FORM_STEPS.PREVIEW) {
        if (!state.file) {
          setError("Bitte wählen Sie ein Bild aus");
          return;
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
      } else if (state.currentStep === FORM_STEPS.RESULT) {
        const { fontSize, balkenOffset, colorScheme, credit, uploadedImage, image } = state.formData;
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
        
        if (!modifiedImage) {
          throw new Error(ERROR_MESSAGES.NO_MODIFIED_IMAGE_DATA);
        }
        
        await updateFormData({ 
          generatedImageSrc: modifiedImage,
          fontSize,
          balkenOffset,
          colorScheme,
          credit,
          image: imageToUse
        });
      }
    } catch (error) {
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
    setAlternatives,
    showAlternatives
  ]);

  useEffect(() => {
    // Entferne den gesamten Effekt, da er nur für Logging verwendet wurde
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
        setFile(selectedFile);
        const processedFile = await processImageForUpload(selectedFile);
        
        const imageFile = processedFile instanceof File ? processedFile : 
          new File([processedFile], selectedFile.name || 'image.jpg', { 
            type: processedFile.type || 'image/jpeg' 
          });

        updateFormData({ 
          uploadedImage: imageFile,
          image: imageFile
        });
      }
    } catch (error) {
      setError(`Fehler bei der Bildverarbeitung: ${error.message}`);
    }
  }, [setFile, updateFormData, setError]);
  

  useEffect(() => {
    // Entferne den gesamten Effekt, da er nur für Logging verwendet wurde
  }, [state.file, state.formData.uploadedImage, state.selectedImage, state.currentStep, state.error]);
  
  const handleControlChange = useCallback((name, value) => {
    if (name === 'balkenOffset' && !Array.isArray(value)) {
      value = Array.isArray(state.formData.balkenOffset) 
        ? state.formData.balkenOffset 
        : SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET;
    }
    updateFormData({ [name]: value });
  }, [state.formData.balkenOffset, updateFormData]);

  const submitButtonText = useMemo(() => {
    const isMobile = window.innerWidth <= 768;
    return state.currentStep === FORM_STEPS.INPUT ? BUTTON_LABELS.GENERATE_TEXT :
    state.currentStep === FORM_STEPS.PREVIEW ? (isMobile ? BUTTON_LABELS.GENERATE_IMAGE_MOBILE : BUTTON_LABELS.GENERATE_IMAGE) :
    BUTTON_LABELS.MODIFY_IMAGE;
  }, [state.currentStep]);

  const memoizedFormFields = useMemo(() => {
    const fields = renderFormFields(state.currentStep, state.formData, handleChange, errors);
    return fields;
  }, [state.currentStep, state.formData, handleChange, errors]);

  const handleSloganSelect = useCallback((selected) => {
    if (state.formData.type === 'Zitat') {
      updateFormData({
        ...state.formData,
        quote: selected.quote
      });
    } else {
      selectSlogan(selected);
    }
  }, [state.formData.type, updateFormData, selectSlogan]);

  const fileUploadProps = {
    loading: state.loading,
    file: state.file,
    handleChange: handleFileChange,
    error: state.error,
    allowedTypes: SHAREPIC_GENERATOR.ALLOWED_FILE_TYPES,
    alternativesButtonProps: {
      isExpanded: showAlternatives,
      onClick: () => {
        setShowAlternatives(!showAlternatives);
      },
      onSloganSelect: handleSloganSelect
    }
  };

  const helpContent = getHelpContent(state.currentStep, showAlternatives);
  const helpDisplay = helpContent ? (
    <HelpDisplay
      content={helpContent.content}
      tips={helpContent.tips}
    />
  ) : null;

  const displayContent = useMemo(() => {
    if (state.currentStep === FORM_STEPS.PREVIEW) {
      return (
        <>
          {helpDisplay}
          {showAlternatives && (
            <SloganAlternativesDisplay
              currentSlogan={
                state.formData.type === 'Zitat'
                  ? { quote: state.formData.quote }
                  : {
                      line1: state.formData.line1,
                      line2: state.formData.line2,
                      line3: state.formData.line3
                    }
              }
              alternatives={state.formData.sloganAlternatives}
              onSloganSelect={handleSloganSelect}
            />
          )}
        </>
      );
    }
    return helpDisplay;
  }, [state.currentStep, state.formData, helpDisplay, showAlternatives, handleSloganSelect]);

  const handleTypeSelect = useCallback((selectedType) => {
    updateFormData({ 
      type: selectedType,
      currentStep: FORM_STEPS.INPUT 
    });
  }, [updateFormData]);

  if (state.currentStep === FORM_STEPS.WELCOME && !hasSeenWelcome) {
    return (
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <WelcomePage
          title="Sharepic-Grünerator"
          description="Erstelle professionelle Sharepics für Social Media. Die KI hilft dir dabei, deine Botschaft optimal zu präsentieren."
          stepsTitle="In drei Schritten zu deinem Sharepic"
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
              description: "Passe Farben und Schriftgröße deinen Wünschen an."
            }
          ]}
          onStart={() => updateFormData({ currentStep: FORM_STEPS.TYPE_SELECT })}
        />
      </div>
    );
  }

  if (state.currentStep === FORM_STEPS.TYPE_SELECT) {
    return <SharepicTypeSelector onTypeSelect={handleTypeSelect} />;
  }

  return (
    <ErrorBoundary>
      <VerifyFeature feature="sharepic">
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
            generatedContent={state.generatedImageSrc || displayContent}
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
      </VerifyFeature>
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
      <ErrorBoundary>
        <SharepicGeneratorContent {...props} />
      </ErrorBoundary>
    </SharepicGeneratorProvider>
  );
}