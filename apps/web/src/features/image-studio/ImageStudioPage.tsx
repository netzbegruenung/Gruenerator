import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { HiArrowLeft } from 'react-icons/hi';
import { generateSharepicFromPrompt } from '../../services/sharepicPromptService';
import useImageStudioStore from '../../stores/imageStudioStore';
import TemplateStudioFlow from './flows/TemplateStudioFlow';
import { useImageGeneration } from './hooks/useImageGeneration';
import useImageGenerationLimit from '../../hooks/useImageGenerationLimit';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import Button from '../../components/common/SubmitButton';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useTemplateClone } from './hooks/useTemplateClone';
import Spinner from '../../components/common/Spinner';
import {
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  TYPE_CONFIG,
  getTypeConfig,
  getCategoryConfig,
  URL_TYPE_MAP
} from './utils/typeConfig';

// Import extracted components and types
import ImageStudioCategorySelector from './components/ImageStudioCategorySelector';
import ImageStudioTypeSelector from './components/ImageStudioTypeSelector';
import {
  FormErrors,
  ImageStudioPageContentProps,
  ImageStudioPageProps,
  SloganAlternative,
  UrlTypeMapKey
} from './types/componentTypes';

import '../../assets/styles/components/sharepic/sharepic-type-selector.css';
import '../../assets/styles/components/form/form-inputs.css';
import '../../assets/styles/components/baseform/form-layout.css';

const ImageStudioPageContent: React.FC<ImageStudioPageContentProps> = ({ showHeaderFooter = true }) => {
  const { category: urlCategory, type: urlType } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    category, subcategory, type, currentStep,
    setCategory, setType, setCurrentStep, goBack,
    thema, details, line1, line2, line3, quote, name,
    header, subheader, body,
    fontSize, balkenOffset, colorScheme,
    balkenGruppenOffset, sunflowerOffset, credit,
    uploadedImage, generatedImageSrc, sloganAlternatives,
    precisionMode, precisionInstruction, selectedInfrastructure,
    variant, imagineTitle, purePrompt, sharepicPrompt,
    handleChange, updateFormData, setGeneratedImage,
    setSloganAlternatives, goToNextStep, resetStore,
    loadGalleryEditData, loadEditSessionData, galleryEditMode, editShareToken,
    aiGeneratedContent
  } = useImageStudioStore();

  const { generateText, generateImage, loading, error, setError } = useImageGeneration();
  const { data: imageLimitData, refetch: refetchImageLimit } = useImageGenerationLimit();
  const { cloneTemplate, isCloning } = useTemplateClone();

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isAlternativesExpanded, setIsAlternativesExpanded] = useState(false);

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);

  // Get user locale from auth store
  const { user } = useOptimizedAuth();
  const isAustrianUser = user?.locale === 'de-AT';

  // Auto-route Austrian users to KI category
  useEffect(() => {
    if (isAustrianUser && !category) {
      console.log('[ImageStudioPage] Austrian user detected, auto-routing to KI category');
      setCategory('ki', null);
    }
  }, [isAustrianUser, category, setCategory]);

  useEffect(() => {
    if (!urlCategory) return;

    // Skip URL sync when content was generated via AI prompt (state is already set correctly)
    // Clear the flag after use so future unmounts will reset properly
    if (aiGeneratedContent) {
      updateFormData({ aiGeneratedContent: false });
      return;
    }

    // Check if urlType is actually a subcategory (create/edit)
    const isSubcategory = urlType && Object.values(KI_SUBCATEGORIES).includes(urlType as unknown as string);

    if (isSubcategory) {
      // URL: /image-studio/ki/create or /image-studio/ki/edit
      if (!category || !subcategory || subcategory !== urlType) {
        setCategory(urlCategory, urlType as unknown as "edit" | "create");
      }
    } else if (urlType) {
      // URL: /image-studio/ki/green-edit (actual type)
      const mappedType = (urlType in URL_TYPE_MAP ? URL_TYPE_MAP[urlType as UrlTypeMapKey] : urlType) || urlType;
      // Only set type if not navigating back (currentStep !== TYPE_SELECT prevents race condition)
      if (mappedType && TYPE_CONFIG[mappedType] && !type && currentStep !== FORM_STEPS.TYPE_SELECT) {
        setCategory(TYPE_CONFIG[mappedType].category, TYPE_CONFIG[mappedType].subcategory);
        setType(mappedType);
      }
    } else if (!category) {
      // URL: /image-studio/templates or /image-studio/ki (without subcategory)
      setCategory(urlCategory);
    }
  }, [urlCategory, urlType, category, subcategory, type, currentStep, setCategory, setType, aiGeneratedContent]);

  // Handle gallery edit mode from location.state
  useEffect(() => {
    const loadGalleryEdit = async () => {
      if (!location.state?.galleryEditMode) return;

      const editData = {
        shareToken: location.state.shareToken,
        content: location.state.content,
        styling: location.state.styling,
        originalImageUrl: location.state.originalImageUrl,
        title: location.state.title
      };

      await loadGalleryEditData(editData);

      // Clear location state to prevent reloading on refresh
      window.history.replaceState({}, document.title);
    };

    loadGalleryEdit();
  }, [location.state, loadGalleryEditData]);

  // Handle template cloning from URL query parameter
  useEffect(() => {
    const templateToken = searchParams.get('template');
    if (templateToken) {
      cloneTemplate(templateToken);
    }
  }, [searchParams, cloneTemplate]);

  // Handle editSession from URL (from PresseSocialGenerator or other sources)
  useEffect(() => {
    const editSessionId = searchParams.get('editSession');
    if (!editSessionId) return;

    const loadSession = async () => {
      const result = await loadEditSessionData(editSessionId);
      if (result) {
        // Clear URL param after loading
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('editSession');
        navigate(`${location.pathname}?${newParams.toString()}`.replace(/\?$/, ''), { replace: true });
      }
    };

    loadSession();
  }, [searchParams, loadEditSessionData, navigate, location.pathname]);

  useEffect(() => {
    return () => {
      // Only reset if NOT navigating internally (aiGeneratedContent means internal navigation)
      const state = useImageStudioStore.getState();
      if (!state.aiGeneratedContent) {
        resetStore();
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.TYPE_SELECT) {
      setCategory(null, null);
      navigate('/image-studio');
    } else if (currentStep === FORM_STEPS.IMAGE_UPLOAD) {
      navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
      goBack();
    } else if (currentStep === FORM_STEPS.INPUT) {
      const prevStep = typeConfig?.steps?.[typeConfig.steps.indexOf(currentStep) - 1];
      if (prevStep === FORM_STEPS.TYPE_SELECT || !prevStep) {
        navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
      }
      goBack();
    } else {
      goBack();
    }
  }, [currentStep, category, subcategory, typeConfig, goBack, setCategory, navigate]);

  const validateForm = useCallback(() => {
    const errors: FormErrors = {};

    if (currentStep === FORM_STEPS.INPUT) {
      if (typeConfig?.hasTextGeneration) {

        if (typeConfig?.usesFluxApi) {
          if ((type === IMAGE_STUDIO_TYPES.PURE_CREATE || type === IMAGE_STUDIO_TYPES.AI_EDITOR) && (!purePrompt || purePrompt.trim().length < 5)) {
            errors.purePrompt = 'Bitte beschreibe dein Bild (mindestens 5 Zeichen)';
          }
          if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC && (!sharepicPrompt || sharepicPrompt.trim().length < 5)) {
            errors.sharepicPrompt = 'Bitte beschreibe dein Bild (mindestens 5 Zeichen)';
          }
          if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT) {
            if (!uploadedImage) {
              errors.uploadedImage = 'Bitte lade ein Bild hoch';
            }
            if (precisionMode && (!precisionInstruction || precisionInstruction.trim().length < 15)) {
              errors.precisionInstruction = 'Bitte gib eine detaillierte Anweisung ein (mindestens 15 Zeichen)';
            }
            if (!precisionMode && (!selectedInfrastructure || selectedInfrastructure.length === 0)) {
              errors.selectedInfrastructure = 'Bitte wähle mindestens eine Verbesserung aus';
            }
          }
          if (type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
            if (!uploadedImage) {
              errors.uploadedImage = 'Bitte lade ein Bild hoch';
            }
            if (!precisionInstruction || precisionInstruction.trim().length < 15) {
              errors.precisionInstruction = 'Bitte gib eine Bearbeitungsanweisung ein (mindestens 15 Zeichen)';
            }
          }
          if (typeConfig?.requiresImage && !uploadedImage) {
            errors.uploadedImage = 'Bitte lade ein Bild hoch';
          }
        }
      }

      setFormErrors(errors);
      return Object.keys(errors).length === 0;
    }
    return true;
  }, [currentStep, typeConfig, type, thema, purePrompt, sharepicPrompt, uploadedImage, precisionMode, precisionInstruction, selectedInfrastructure]);

  const handleFormSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      if (currentStep === FORM_STEPS.INPUT) {
        if (typeConfig?.hasTextGeneration) {
          const result = await generateText(type || '', {
            thema, details, name
          });

          if (result) {
            if (result.mainSlogan) {
              updateFormData({
                line1: result.mainSlogan.line1 || '',
                line2: result.mainSlogan.line2 || '',
                line3: result.mainSlogan.line3 || '',
                searchTerms: result.searchTerms || []
              });
              setSloganAlternatives(result.alternatives || []);
            } else if (result.quote) {
              updateFormData({ quote: result.quote });
              setSloganAlternatives(result.alternatives || []);
            } else if (result.header) {
              updateFormData({
                header: result.header,
                subheader: result.subheader || '',
                body: result.body,
                searchTerms: result.searchTerms || []
              });
              setSloganAlternatives(result.alternatives || []);
            }
          }
          goToNextStep();
        } else if (typeConfig?.usesFluxApi) {
          const formData = {
            purePrompt, sharepicPrompt, imagineTitle, variant,
            uploadedImage, precisionMode, precisionInstruction,
            selectedInfrastructure
          };

          const image = await generateImage(type || '', formData);
          setGeneratedImage(image);
          refetchImageLimit();
          goToNextStep();
          goToNextStep();
        }
      } else if (currentStep === FORM_STEPS.PREVIEW) {
        const formData = {
          type: typeConfig?.legacyType || type,
          line1, line2, line3, quote, name,
          header, subheader, body,
          uploadedImage, fontSize, colorScheme,
          balkenOffset, balkenGruppenOffset, sunflowerOffset, credit
        };

        const image = await generateImage(type || '', formData);
        setGeneratedImage(image);
        goToNextStep();
      } else if (currentStep === FORM_STEPS.RESULT) {
        if (typeConfig?.usesFluxApi) {
          const formData = {
            purePrompt, sharepicPrompt, imagineTitle, variant,
            uploadedImage, precisionMode, precisionInstruction,
            selectedInfrastructure
          };

          const image = await generateImage(type || '', formData);
          setGeneratedImage(image);
          refetchImageLimit();
        } else {
          const formData = {
            type: typeConfig?.legacyType || type,
            line1, line2, line3, quote, name,
            header, subheader, body,
            uploadedImage, fontSize, colorScheme,
            balkenOffset, balkenGruppenOffset, sunflowerOffset, credit
          };

          const image = await generateImage(type || '', formData);
          setGeneratedImage(image);
        }
      }
    } catch (err) {
      console.error('[ImageStudioPage] Form submission error:', err);
    }
  }, [
    currentStep, type, typeConfig, validateForm, generateText, generateImage,
    thema, details, name, line1, line2, line3, quote,
    header, subheader, body,
    purePrompt, sharepicPrompt, imagineTitle, variant,
    uploadedImage, fontSize, colorScheme, balkenOffset,
    balkenGruppenOffset, sunflowerOffset, credit,
    precisionMode, precisionInstruction, selectedInfrastructure,
    updateFormData, setSloganAlternatives, setGeneratedImage,
    goToNextStep, refetchImageLimit
  ]);

  // Category selector rendering is handled by ImageStudioCategorySelector sub-component

  // Type selector and form fields are handled by sub-components

  if (currentStep === FORM_STEPS.CATEGORY_SELECT || !category) {
    return <ImageStudioCategorySelector />;
  }

  if (currentStep === FORM_STEPS.TYPE_SELECT || !type) {
    return <ImageStudioTypeSelector />;
  }

  const renderCurrentStep = () => {
    // Route all types (KI, templates with text gen, and pure canvas templates) through unified TemplateStudioFlow
    if (typeConfig?.usesFluxApi || typeConfig?.hasTextGeneration || typeConfig?.endpoints?.canvas) {
      return <TemplateStudioFlow onBack={handleBack} />;
    }

    // Fallback for unsupported types
    return (
      <div className="container" role="main" aria-label="Image Studio">
        <div className="form-card form-card--elevated">
          <h2>{typeConfig?.label || 'Image Studio'}</h2>
          <p>Dieser Typ wird noch nicht unterstützt.</p>
          <Button onClick={handleBack} text="Zurück" icon={<HiArrowLeft />} />
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      {renderCurrentStep()}
    </ErrorBoundary>
  );
};

const ImageStudioPage: React.FC<ImageStudioPageProps> = ({ showHeaderFooter = true }) => {
  return <ImageStudioPageContent showHeaderFooter={showHeaderFooter} />;
};

export default withAuthRequired(ImageStudioPage);
