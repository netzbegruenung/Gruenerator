import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { HiArrowLeft } from 'react-icons/hi';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import Spinner from '../../components/common/Spinner';
import Button from '../../components/common/SubmitButton';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';
import useImageGenerationLimit from '../../hooks/useImageGenerationLimit';
import useImageStudioStore from '../../stores/imageStudioStore';

import ImageStudioCategorySelector from './components/ImageStudioCategorySelector';
import ImageStudioTypeSelector from './components/ImageStudioTypeSelector';
import TemplateStudioFlow from './flows/TemplateStudioFlow';
import { useImageGeneration } from './hooks/useImageGeneration';
import { useTemplateClone } from './hooks/useTemplateClone';
import { type FormErrors, type UrlTypeMapKey } from './types/componentTypes';
import {
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  TYPE_CONFIG,
  getTypeConfig,
  URL_TYPE_MAP,
} from './utils/typeConfig';

// Import extracted components and types

import './image-studio-shared.css';
import '../../assets/styles/components/form/form-inputs.css';
import '../../assets/styles/components/baseform/form-layout.css';

const ImageStudioPageContent: React.FC = () => {
  const { category: urlCategory, type: urlType } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    category,
    subcategory,
    type,
    currentStep,
    setCategory,
    setType,
    goBack,
    thema,
    details,
    line1,
    line2,
    line3,
    quote,
    name,
    header,
    subheader,
    body,
    fontSize,
    balkenOffset,
    colorScheme,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    uploadedImage,
    precisionMode,
    precisionInstruction,
    selectedInfrastructure,
    variant,
    imagineTitle,
    purePrompt,
    sharepicPrompt,
    updateFormData,
    setGeneratedImage,
    setSloganAlternatives,
    goToNextStep,
    resetStore,
    loadGalleryEditData,
    loadEditSessionData,
    aiGeneratedContent,
  } = useImageStudioStore();

  const { generateText, generateImage } = useImageGeneration();
  const { refetch: refetchImageLimit } = useImageGenerationLimit();
  const { cloneTemplate, isCloning, error: cloneError } = useTemplateClone();

  const [_formErrors, setFormErrors] = useState<FormErrors>({});
  const cloneInitiatedRef = useRef(false);

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);

  // Get user locale from auth store (may be used for locale-specific features)
  const { user: _user } = useOptimizedAuth();

  useEffect(() => {
    if (!urlCategory) return;

    // Skip URL sync when content was generated via AI prompt (state is already set correctly)
    // Clear the flag after use so future unmounts will reset properly
    if (aiGeneratedContent) {
      updateFormData({ aiGeneratedContent: false });
      return;
    }

    // Check if urlType is actually a subcategory (create/edit)
    const isKiSubcategory = (value: string | undefined): value is 'edit' | 'create' => {
      return value === KI_SUBCATEGORIES.EDIT || value === KI_SUBCATEGORIES.CREATE;
    };

    if (isKiSubcategory(urlType)) {
      // URL: /image-studio/ki/create or /image-studio/ki/edit
      if (!category || !subcategory || subcategory !== urlType) {
        setCategory(urlCategory, urlType);
      }
    } else if (urlType) {
      // URL: /image-studio/ki/green-edit (actual type)
      const mappedType =
        (urlType in URL_TYPE_MAP ? URL_TYPE_MAP[urlType as UrlTypeMapKey] : urlType) || urlType;
      // Only set type if not navigating back (currentStep !== TYPE_SELECT prevents race condition)
      if (
        mappedType &&
        TYPE_CONFIG[mappedType] &&
        !type &&
        currentStep !== FORM_STEPS.TYPE_SELECT
      ) {
        setCategory(TYPE_CONFIG[mappedType].category, TYPE_CONFIG[mappedType].subcategory);
        setType(mappedType);
      }
    } else if (!category) {
      // URL: /image-studio/templates or /image-studio/ki (without subcategory)
      setCategory(urlCategory);
    }
  }, [
    urlCategory,
    urlType,
    category,
    subcategory,
    type,
    currentStep,
    setCategory,
    setType,
    aiGeneratedContent,
  ]);

  // Handle gallery edit mode from location.state
  useEffect(() => {
    const loadGalleryEdit = async () => {
      if (!location.state?.galleryEditMode) return;

      const editData = {
        shareToken: location.state.shareToken,
        content: location.state.content,
        styling: location.state.styling,
        originalImageUrl: location.state.originalImageUrl,
        title: location.state.title,
      };

      await loadGalleryEditData(editData);

      // Clear location state to prevent reloading on refresh
      window.history.replaceState({}, document.title);
    };

    void loadGalleryEdit();
  }, [location.state, loadGalleryEditData]);

  // Handle template cloning result from location.state (after navigation from useTemplateClone)
  useEffect(() => {
    const loadTemplateData = async () => {
      if (!location.state?.templateMode) return;

      const editData = {
        shareToken: location.state.shareToken,
        content: {
          ...location.state.content,
          sharepicType:
            location.state.sharepicType || location.state.content?.sharepicType || urlType,
        },
        styling: location.state.styling,
      };

      await loadGalleryEditData(editData);

      // Store templateCreator for display in canvas editor
      if (location.state.templateCreator) {
        updateFormData({ templateCreator: location.state.templateCreator });
      }

      window.history.replaceState({}, document.title);
    };

    void loadTemplateData();
  }, [location.state, loadGalleryEditData, urlType, updateFormData]);

  // Handle template cloning from URL query parameter
  useEffect(() => {
    const templateToken = searchParams.get('template');
    if (templateToken && !cloneInitiatedRef.current) {
      cloneInitiatedRef.current = true;
      void cloneTemplate(templateToken);
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
        navigate(`${location.pathname}?${newParams.toString()}`.replace(/\?$/, ''), {
          replace: true,
        });
      }
    };

    void loadSession();
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

  const isImagineRoute = location.pathname.startsWith('/imagine');

  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.TYPE_SELECT) {
      setCategory(null, null);
      navigate(isImagineRoute ? '/imagine' : '/image-studio');
    } else if (currentStep === FORM_STEPS.IMAGE_UPLOAD) {
      if (isImagineRoute) {
        navigate('/imagine');
      } else {
        navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
      }
      goBack();
    } else if (currentStep === FORM_STEPS.INPUT) {
      const prevStep = typeConfig?.steps?.[typeConfig.steps.indexOf(currentStep) - 1];
      if (prevStep === FORM_STEPS.TYPE_SELECT || !prevStep) {
        if (isImagineRoute) {
          navigate('/imagine');
        } else {
          navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
        }
      }
      goBack();
    } else {
      goBack();
    }
  }, [
    currentStep,
    category,
    subcategory,
    typeConfig,
    goBack,
    setCategory,
    navigate,
    isImagineRoute,
  ]);

  const validateForm = useCallback(() => {
    const errors: FormErrors = {};

    if (currentStep === FORM_STEPS.INPUT) {
      if (typeConfig?.hasTextGeneration) {
        if (typeConfig?.usesFluxApi) {
          if (
            (type === IMAGE_STUDIO_TYPES.PURE_CREATE || type === IMAGE_STUDIO_TYPES.AI_EDITOR) &&
            (!purePrompt || purePrompt.trim().length < 5)
          ) {
            errors.purePrompt = 'Bitte beschreibe dein Bild (mindestens 5 Zeichen)';
          }
          if (type === IMAGE_STUDIO_TYPES.GREEN_EDIT) {
            if (!uploadedImage) {
              errors.uploadedImage = 'Bitte lade ein Bild hoch';
            }
            if (
              precisionMode &&
              (!precisionInstruction || precisionInstruction.trim().length < 15)
            ) {
              errors.precisionInstruction =
                'Bitte gib eine detaillierte Anweisung ein (mindestens 15 Zeichen)';
            }
            if (
              !precisionMode &&
              (!selectedInfrastructure || selectedInfrastructure.length === 0)
            ) {
              errors.selectedInfrastructure = 'Bitte wähle mindestens eine Verbesserung aus';
            }
          }
          if (type === IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT) {
            if (!uploadedImage) {
              errors.uploadedImage = 'Bitte lade ein Bild hoch';
            }
            if (!precisionInstruction || precisionInstruction.trim().length < 15) {
              errors.precisionInstruction =
                'Bitte gib eine Bearbeitungsanweisung ein (mindestens 15 Zeichen)';
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
  }, [
    currentStep,
    typeConfig,
    type,
    purePrompt,
    uploadedImage,
    precisionMode,
    precisionInstruction,
    selectedInfrastructure,
  ]);

  const _handleFormSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      if (currentStep === FORM_STEPS.INPUT) {
        if (typeConfig?.hasTextGeneration) {
          const result = await generateText(type || '', {
            thema,
            details,
            name,
          });

          if (result) {
            if (result.mainSlogan) {
              updateFormData({
                line1: result.mainSlogan.line1 || '',
                line2: result.mainSlogan.line2 || '',
                line3: result.mainSlogan.line3 || '',
                searchTerms: result.searchTerms || [],
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
                searchTerms: result.searchTerms || [],
              });
              setSloganAlternatives(result.alternatives || []);
            }
          }
          goToNextStep();
        } else if (typeConfig?.usesFluxApi) {
          const formData = {
            purePrompt,
            sharepicPrompt,
            imagineTitle,
            variant,
            uploadedImage,
            precisionMode,
            precisionInstruction,
            selectedInfrastructure,
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
          line1,
          line2,
          line3,
          quote,
          name,
          header,
          subheader,
          body,
          uploadedImage,
          fontSize,
          colorScheme,
          balkenOffset,
          balkenGruppenOffset,
          sunflowerOffset,
          credit,
        };

        const image = await generateImage(type || '', formData);
        setGeneratedImage(image);
        goToNextStep();
      } else if (currentStep === FORM_STEPS.RESULT) {
        if (typeConfig?.usesFluxApi) {
          const formData = {
            purePrompt,
            sharepicPrompt,
            imagineTitle,
            variant,
            uploadedImage,
            precisionMode,
            precisionInstruction,
            selectedInfrastructure,
          };

          const image = await generateImage(type || '', formData);
          setGeneratedImage(image);
          refetchImageLimit();
        } else {
          const formData = {
            type: typeConfig?.legacyType || type,
            line1,
            line2,
            line3,
            quote,
            name,
            header,
            subheader,
            body,
            uploadedImage,
            fontSize,
            colorScheme,
            balkenOffset,
            balkenGruppenOffset,
            sunflowerOffset,
            credit,
          };

          const image = await generateImage(type || '', formData);
          setGeneratedImage(image);
        }
      }
    } catch (err) {
      console.error('[ImageStudioPage] Form submission error:', err);
    }
  }, [
    currentStep,
    type,
    typeConfig,
    validateForm,
    generateText,
    generateImage,
    thema,
    details,
    name,
    line1,
    line2,
    line3,
    quote,
    header,
    subheader,
    body,
    purePrompt,
    sharepicPrompt,
    imagineTitle,
    variant,
    uploadedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    precisionMode,
    precisionInstruction,
    selectedInfrastructure,
    updateFormData,
    setSloganAlternatives,
    setGeneratedImage,
    goToNextStep,
    refetchImageLimit,
  ]);

  // Category selector rendering is handled by ImageStudioCategorySelector sub-component

  // Type selector and form fields are handled by sub-components

  // Show loading state while cloning template
  if (isCloning) {
    console.log('[ImageStudioPage] Showing cloning spinner');
    return (
      <div
        className="container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
          gap: 'var(--spacing-medium)',
        }}
      >
        <Spinner size="medium" />
        <p>Vorlage wird geladen...</p>
      </div>
    );
  }

  // Show error if template cloning failed (only when there's actually a template param)
  const hasTemplateParam = searchParams.get('template');
  if (cloneError && hasTemplateParam) {
    console.error('[ImageStudioPage] Clone error display:', cloneError);
    return (
      <div className="container" role="main" aria-label="Image Studio">
        <div className="form-card form-card--elevated">
          <h2>Fehler beim Laden der Vorlage</h2>
          <p>{cloneError}</p>
          <Button onClick={() => navigate('/image-studio')} text="Zurück" icon={<HiArrowLeft />} />
        </div>
      </div>
    );
  }

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

  return <ErrorBoundary>{renderCurrentStep()}</ErrorBoundary>;
};

const ImageStudioPage: React.FC = () => {
  return <ImageStudioPageContent />;
};

export default withAuthRequired(ImageStudioPage);
