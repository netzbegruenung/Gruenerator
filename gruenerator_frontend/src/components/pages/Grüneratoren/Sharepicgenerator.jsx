// SharepicGeneratorneu
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useSharepicStore } from '../../../stores';
import { useSharepicGeneration } from '../../../features/sharepic/core/hooks/useSharepicGeneration';
import BaseForm from '../../../features/sharepic/core/components/BaseForm-Sharepic';
import WelcomePage from '../../common/WelcomePage';
import ErrorBoundary from '../../ErrorBoundary';
import { processImageForUpload } from '../../../components/utils/imageCompression';
import HelpDisplay from '../../common/HelpDisplay';
import VerifyFeature from '../../common/VerifyFeature';
import { SloganAlternativesDisplay } from '../../../features/sharepic/core/components/SloganAlternatives';

import { 
  FORM_STEPS, 
  BUTTON_LABELS, 
  SHAREPIC_GENERATOR, 
  ERROR_MESSAGES,
  SHAREPIC_TYPES,
} from '../../utils/constants';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

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

  // Moved from useSharepicRendering hook - inline renderFormFields function
  const renderFormFields = (currentStep, formData, handleChange, formErrors = {}, defaultSharepicType) => {
    let fields = null;

    if (currentStep === FORM_STEPS.INPUT) {
      fields = (
        <>
          <input
            type="hidden"
            id="type"
            name="type"
            value={defaultSharepicType}
          />
          
          <h3><label htmlFor="thema">Thema</label></h3>
          <input
            id="thema"
            name="thema"
            type="text"
            placeholder="Klimaschutzinitiative"
            value={formData.thema || ''}
            onChange={handleChange}
            className={`form-input ${formErrors.thema ? 'error-input' : ''}`}
          />
          {formErrors.thema && <div className="error-message">{formErrors.thema}</div>}
          
          <h3><label htmlFor="details">Details</label></h3>
          <textarea
            id="details"
            name="details"
            placeholder="Details zur Initiative, beteiligte Personen und geplante Aktionen."
            value={formData.details || ''}
            onChange={handleChange}
            className={`form-textarea ${formErrors.details ? 'error-input' : ''}`}
          />
          {formErrors.details && <div className="error-message">{formErrors.details}</div>}
        </>
      );
    }

    if (currentStep === FORM_STEPS.PREVIEW || currentStep === FORM_STEPS.RESULT) {
      if (formData.type === 'Zitat' || formData.type === 'Zitat_Pure') {
        // Both Zitat types use quote + name fields
        fields = (
          <>
            <h3><label htmlFor="quote">Zitat</label></h3>
            <textarea
              id="quote"
              name="quote"
              value={formData.quote || ''}
              onChange={handleChange}
              className={`form-textarea ${formErrors.quote ? 'error-input' : ''}`}
              placeholder="Gib hier das Zitat ein..."
              rows={4}
            />
            {formErrors.quote && <div className="error-message">{formErrors.quote}</div>}

            <h3><label htmlFor="name">Name</label></h3>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.name ? 'error-input' : ''}`}
              placeholder="Name der zitierten Person"
            />
            {formErrors.name && <div className="error-message">{formErrors.name}</div>}
          </>
        );
      } else if (formData.type === 'Info') {
        // Info type uses header + subheader + body fields
        fields = (
          <>
            <h3><label htmlFor="header">Überschrift</label></h3>
            <input
              id="header"
              type="text"
              name="header"
              value={formData.header || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.header ? 'error-input' : ''}`}
              placeholder="Hauptüberschrift des Infoposts"
            />
            {formErrors.header && <div className="error-message">{formErrors.header}</div>}

            <h3><label htmlFor="subheader">Untertitel</label></h3>
            <input
              id="subheader"
              type="text"
              name="subheader"
              value={formData.subheader || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.subheader ? 'error-input' : ''}`}
              placeholder="Wichtigster Fakt oder Beleg"
            />
            {formErrors.subheader && <div className="error-message">{formErrors.subheader}</div>}

            <h3><label htmlFor="body">Text</label></h3>
            <textarea
              id="body"
              name="body"
              value={formData.body || ''}
              onChange={handleChange}
              className={`form-textarea ${formErrors.body ? 'error-input' : ''}`}
              placeholder="Haupttext des Infoposts..."
              rows={6}
            />
            {formErrors.body && <div className="error-message">{formErrors.body}</div>}
          </>
        );
      } else {
        // Dreizeilen and Headline types use 3-line fields
        fields = (
          <>
            <h3><label htmlFor="line1">Zeile 1</label></h3>
            <input
              id="line1"
              type="text"
              name="line1"
              value={formData.line1 || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.line1 ? 'error-input' : ''}`}
            />
            {formErrors.line1 && <div className="error-message">{formErrors.line1}</div>}

            <h3><label htmlFor="line2">Zeile 2</label></h3>
            <input
              id="line2"
              type="text"
              name="line2"
              value={formData.line2 || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.line2 ? 'error-input' : ''}`}
            />
            {formErrors.line2 && <div className="error-message">{formErrors.line2}</div>}

            <h3><label htmlFor="line3">Zeile 3</label></h3>
            <input
              id="line3"
              type="text"
              name="line3"
              value={formData.line3 || ''}
              onChange={handleChange}
              className={`form-input ${formErrors.line3 ? 'error-input' : ''}`}
            />
            {formErrors.line3 && <div className="error-message">{formErrors.line3}</div>}
          </>
        );
      }
    }
    return fields;
  };

  const {
    // State
    type, thema, details, line1, line2, line3, quote, name, fontSize,
    balkenOffset, colorScheme, balkenGruppenOffset, sunflowerOffset, credit,
    searchTerms, sloganAlternatives, currentStep, isAdvancedEditingOpen,
    isSearchBarActive, isSubmitting, currentSubmittingStep, loading, error,
    isLoadingUnsplashImages, unsplashError, uploadedImage, file, selectedImage,
    generatedImageSrc, unsplashImages,
    // Actions
    setFile, setError, updateFormData, modifyImage, setSloganAlternatives,
    selectSlogan, setAlternatives
  } = useSharepicStore();

  // Create state object for compatibility with existing code
  const state = {
    formData: {
      type, thema, details, line1, line2, line3, quote, name, fontSize,
      balkenOffset, colorScheme, balkenGruppenOffset, sunflowerOffset, credit,
      searchTerms, sloganAlternatives
    },
    currentStep, isAdvancedEditingOpen, isSearchBarActive, isSubmitting,
    currentSubmittingStep, loading, error, isLoadingUnsplashImages,
    unsplashError, uploadedImage, file, selectedImage, generatedImageSrc,
    unsplashImages
  };

  const { generateText, generateImage, loading: generationLoading, error: generationError } = useSharepicGeneration();

  const [errors, setErrors] = useState({});
  const [showAlternatives, setShowAlternatives] = useState(false);

  const { user, loading: authLoading, isAuthResolved } = useOptimizedAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthResolved && !authLoading && !user) {
      navigate('/');
    }
  }, [authLoading, user, navigate, isAuthResolved]);

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
        const result = await generateText(state.formData.type, { 
          thema: state.formData.thema, 
          details: state.formData.details,
          quote: state.formData.quote,
          name: state.formData.name
        });
        
        if (!result) throw new Error(ERROR_MESSAGES.NO_TEXT_DATA);
        
        if (state.formData.type === 'Zitat' || state.formData.type === 'Zitat_Pure') {
          await updateFormData({ 
            ...state.formData,
            quote: result.quote,
            name: result.name || state.formData.name,
            currentStep: FORM_STEPS.PREVIEW,
            sloganAlternatives: result.alternatives || []
          });
          setAlternatives(result.alternatives || []);
        } else if (state.formData.type === 'Info') {
          await updateFormData({ 
            ...state.formData,
            header: result.header,
            subheader: result.subheader,
            body: result.body,
            currentStep: FORM_STEPS.PREVIEW,
            sloganAlternatives: result.alternatives || []
          });
          setAlternatives(result.alternatives || []);
        } else {
          // Dreizeilen and Headline types
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
        // Handle image generation based on sharepic type
        if (state.formData.type === 'Zitat_Pure') {
          // Zitat Pure doesn't need an image upload - generate directly
          const imageResult = await generateImage({ 
            ...state.formData
          });

          if (!imageResult) {
            throw new Error("Keine Bilddaten empfangen");
          }

          await updateFormData({ 
            generatedImageSrc: imageResult, 
            currentStep: FORM_STEPS.RESULT
          });
        } else if (state.formData.type === 'Headline' || state.formData.type === 'Info') {
          // Headline and Info also generate directly without image upload
          const imageResult = await generateImage({ 
            ...state.formData
          });

          if (!imageResult) {
            throw new Error("Keine Bilddaten empfangen");
          }

          await updateFormData({ 
            generatedImageSrc: imageResult, 
            currentStep: FORM_STEPS.RESULT
          });
        } else {
          // Regular types (Dreizeilen, Zitat) need image upload
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
        }
      } else if (state.currentStep === FORM_STEPS.RESULT) {
        if (state.formData.type === 'Info') {
          // For info posts: direct regeneration using generateImage()
          const imageResult = await generateImage({ 
            ...state.formData
          });
          
          if (!imageResult) {
            throw new Error("Keine Bilddaten empfangen");
          }
          
          await updateFormData({ 
            generatedImageSrc: imageResult
          });
        } else {
          // For other types: existing modifyImage() logic
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
    setAlternatives,
    showAlternatives
  ]);

  useEffect(() => {
    // Entferne den gesamten Effekt, da er nur für Logging verwendet wurde
  }, [state.currentStep, state.isSubmitting, state.currentSubmittingStep]);
  
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
    console.log('[SharepicGenerator] handleSloganSelect called. Type:', state.formData.type, 'Selected Slogan:', JSON.stringify(selected));
    if (state.formData.type === 'Zitat' || state.formData.type === 'Zitat_Pure') {
      console.log('[SharepicGenerator] Quote slogan selected. Current state.formData from closure:', JSON.stringify(state.formData));
      updateFormData({
        quote: selected.quote
      });
    } else if (state.formData.type === 'Info') {
      updateFormData({
        header: selected.header,
        body: selected.body
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
                (state.formData.type === 'Zitat' || state.formData.type === 'Zitat_Pure')
                  ? { quote: state.formData.quote }
                  : state.formData.type === 'Info'
                  ? { header: state.formData.header, body: state.formData.body }
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
    if (selectedType === SHAREPIC_TYPES.QUOTE) {
      // For Zitat, go to sub-selection first
      updateFormData({ 
        type: selectedType,
        currentStep: FORM_STEPS.ZITAT_SUB_SELECT 
      });
    } else {
      // For other types, go directly to input
      updateFormData({ 
        type: selectedType,
        currentStep: FORM_STEPS.INPUT 
      });
    }
  }, [updateFormData]);

  const handleZitatSubSelect = useCallback((zitatSubType) => {
    updateFormData({ 
      type: zitatSubType, // This will be either 'Zitat' or 'Zitat_Pure'
      currentStep: FORM_STEPS.INPUT 
    });
  }, [updateFormData]);

  if (authLoading || !isAuthResolved) {
    return <div className="container">Lade Authentifizierung...</div>; // Or a more sophisticated loading spinner
  }

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
    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <h1>Wähle dein Sharepic-Format</h1>
          <p className="type-selector-intro">
            Jedes Format ist für einen bestimmten Zweck optimiert.
          </p>
          
          
          <div className="type-options-grid">
            <div className="type-card" onClick={() => handleTypeSelect(SHAREPIC_TYPES.THREE_LINES)}>
              <div className="type-icon">📝</div>
              <h3>Standard-Sharepic</h3>
              <p>Perfekt für kurze, prägnante Botschaften in drei Zeilen. Ideal für Forderungen oder Statements.</p>
            </div>

            <div className="type-card" onClick={() => handleTypeSelect(SHAREPIC_TYPES.QUOTE)}>
              <div className="type-icon">💬</div>
              <h3>Zitat</h3>
              <p>Gestalte eindrucksvolle Zitate. Optimal für Aussagen und Stellungnahmen.</p>
            </div>

            <div className="type-card" onClick={() => handleTypeSelect(SHAREPIC_TYPES.INFO)}>
              <div className="type-icon">📋</div>
              <h3>Infopost</h3>
              <p>Strukturierte Informationsposts mit Überschrift und Text. Ideal für Erklärungen und Details.</p>
            </div>

            <div className="type-card" onClick={() => handleTypeSelect(SHAREPIC_TYPES.HEADLINE)}>
              <div className="type-icon">📰</div>
              <h3>Header</h3>
              <p>Große, markante Headlines in drei Zeilen. Perfect für Schlagzeilen und wichtige Botschaften.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state.currentStep === FORM_STEPS.ZITAT_SUB_SELECT) {
    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <h1>Zitat-Format wählen</h1>
          <p className="type-selector-intro">
            Wähle zwischen einem Zitat mit Hintergrundbild oder einem reinen Text-Zitat.
          </p>
          
          <div className="type-options-grid">
            <div className="type-card" onClick={() => handleZitatSubSelect(SHAREPIC_TYPES.QUOTE)}>
              <div className="type-icon">🖼️</div>
              <h3>Zitat mit Bild</h3>
              <p>Klassisches Zitat mit eigenem Hintergrundbild. Du kannst ein Bild hochladen oder aus Unsplash wählen.</p>
            </div>

            <div className="type-card" onClick={() => handleZitatSubSelect(SHAREPIC_TYPES.QUOTE_PURE)}>
              <div className="type-icon">📝</div>
              <h3>Zitat Pure</h3>
              <p>Reines Text-Zitat auf grünem Hintergrund. Schnell und ohne Bildauswahl.</p>
            </div>
          </div>
          
          <div className="back-button-container">
            <button 
              type="button" 
              className="back-button"
              onClick={() => updateFormData({ currentStep: FORM_STEPS.TYPE_SELECT })}
            >
              ← Zurück zur Format-Auswahl
            </button>
          </div>
        </div>
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
          generatedContent={state.generatedImageSrc || displayContent}
          useDownloadButton={state.currentStep === FORM_STEPS.RESULT}
          showBackButton={state.currentStep > FORM_STEPS.INPUT}
          submitButtonText={submitButtonText}
          currentStep={state.currentStep}
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
    <ErrorBoundary>
      <SharepicGeneratorContent {...props} />
    </ErrorBoundary>
  );
}