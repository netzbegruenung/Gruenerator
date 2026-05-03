import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { HiArrowLeft } from 'react-icons/hi';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';

interface GalleryEditLocationState {
  galleryEditMode?: boolean;
  shareToken?: string;
  content?: Record<string, unknown>;
  styling?: Record<string, unknown>;
  originalImageUrl?: string;
  title?: string;
}

interface TemplateLocationState {
  templateMode?: boolean;
  shareToken?: string;
  content?: Record<string, unknown> & { sharepicType?: string };
  styling?: Record<string, unknown>;
  sharepicType?: string;
  templateCreator?: string;
}

interface ImagineHandoffLocationState {
  imagineHandoff?: boolean;
  generatedImage?: string | null;
  prompt?: string;
  variant?: string | null;
}
import Spinner from '../../components/common/Spinner';
import Button from '../../components/common/SubmitButton';
import ErrorBoundary from '../../components/ErrorBoundary';
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
    goToNextStep,
    resetStore,
    loadGalleryEditData,
    loadEditSessionData,
    aiGeneratedContent,
    setCurrentStep,
    commitAiGeneration,
  } = useImageStudioStore();

  const { generateText, generateImage } = useImageGeneration();
  const { refetch: refetchImageLimit } = useImageGenerationLimit();
  const { cloneTemplate, isCloning, error: cloneError } = useTemplateClone();

  const [_formErrors, setFormErrors] = useState<FormErrors>({});
  const cloneInitiatedRef = useRef(false);

  // When opening a saved sharepic (gallery edit) or a cloned template, the
  // store's currentStep is INPUT until loadGalleryEditData() resolves and
  // flips it to CANVAS_EDIT. Without a gate, the InputStep paints for one
  // frame before being replaced by the canvas — a visible flash. The lazy
  // initializer ensures the spinner is rendered in the very first commit.
  const [isHydratingExisting, setIsHydratingExisting] = useState<boolean>(() => {
    const state = location.state as (GalleryEditLocationState & TemplateLocationState) | null;
    return Boolean(state?.galleryEditMode || state?.templateMode);
  });

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);

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
      // URL: /studio/ki/create or /studio/ki/edit
      if (!category || !subcategory || subcategory !== urlType) {
        setCategory(urlCategory, urlType);
      }
    } else if (urlType) {
      // URL: /studio/ki/green-edit (actual type)
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
      // URL: /studio/templates or /studio/ki (without subcategory)
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
      const state = location.state as GalleryEditLocationState | null;
      if (!state?.galleryEditMode) return;

      const editData = {
        shareToken: state.shareToken ?? '',
        content: state.content,
        styling: state.styling,
        originalImageUrl: state.originalImageUrl,
        title: state.title,
      };

      try {
        await loadGalleryEditData(editData);
        // Clear location state to prevent reloading on refresh
        window.history.replaceState({}, document.title);
      } finally {
        setIsHydratingExisting(false);
      }
    };

    void loadGalleryEdit();
  }, [location.state, loadGalleryEditData]);

  // Handle template cloning result from location.state (after navigation from useTemplateClone)
  useEffect(() => {
    const loadTemplateData = async () => {
      const state = location.state as TemplateLocationState | null;
      if (!state?.templateMode) return;

      const editData = {
        shareToken: state.shareToken ?? '',
        content: {
          ...state.content,
          sharepicType: state.sharepicType ?? state.content?.sharepicType ?? urlType,
        },
        styling: state.styling,
      };

      try {
        await loadGalleryEditData(editData);

        // Store templateCreator for display in canvas editor
        if (state.templateCreator) {
          updateFormData({ templateCreator: state.templateCreator });
        }

        window.history.replaceState({}, document.title);
      } finally {
        setIsHydratingExisting(false);
      }
    };

    void loadTemplateData();
  }, [location.state, loadGalleryEditData, urlType, updateFormData]);

  // Handle Imagine → Studio handoff (image generated in workplace, opened in AI Editor)
  useEffect(() => {
    const state = location.state as ImagineHandoffLocationState | null;
    if (!state?.imagineHandoff || !state.generatedImage) return;

    setType(IMAGE_STUDIO_TYPES.AI_EDITOR);
    updateFormData({
      purePrompt: state.prompt ?? '',
      variant: state.variant ?? null,
      aiGeneratedContent: true,
    });
    commitAiGeneration(state.generatedImage, state.prompt ?? '');
    setCurrentStep(FORM_STEPS.RESULT);

    window.history.replaceState({}, document.title);
  }, [location.state, setType, updateFormData, commitAiGeneration, setCurrentStep]);

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
        void navigate(`${location.pathname}?${newParams.toString()}`.replace(/\?$/, ''), {
          replace: true,
        });
      }
    };

    void loadSession();
  }, [searchParams, loadEditSessionData, navigate, location.pathname]);

  // Handle sharepic handoff from chat (?handoff=<id> → load variant from localStorage)
  useEffect(() => {
    const handoffId = searchParams.get('handoff');
    if (!handoffId) return;

    const storageKey = `gruenerator:sharepic-handoff:${handoffId}`;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.error('[ImageStudioPage] Failed to read sharepic handoff:', err);
    }

    const stripParam = () => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('handoff');
      void navigate(`${location.pathname}?${newParams.toString()}`.replace(/\?$/, ''), {
        replace: true,
      });
    };

    if (!raw) {
      stripParam();
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        canvasType?: string;
        initialProps?: Record<string, unknown>;
        ts?: number;
      };
      const isFresh = parsed.ts && Date.now() - parsed.ts < 5 * 60 * 1000;
      if (!isFresh || !parsed.canvasType || !parsed.initialProps) {
        stripParam();
        return;
      }

      useImageStudioStore
        .getState()
        .loadFromAIGeneration(parsed.canvasType, parsed.initialProps as Record<string, string>);
      useImageStudioStore.getState().setCurrentStep(FORM_STEPS.CANVAS_EDIT);
    } catch (err) {
      console.error('[ImageStudioPage] Failed to parse sharepic handoff payload:', err);
    }

    stripParam();
  }, [searchParams, navigate, location.pathname]);

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
      void navigate(isImagineRoute ? '/imagine' : '/studio');
    } else if (currentStep === FORM_STEPS.IMAGE_UPLOAD) {
      if (isImagineRoute) {
        void navigate('/imagine');
      } else {
        void navigate(`/studio/${category}${subcategory ? `/${subcategory}` : ''}`);
      }
      goBack();
    } else if (currentStep === FORM_STEPS.INPUT) {
      const prevStep = typeConfig?.steps?.[typeConfig.steps.indexOf(currentStep) - 1];
      if (prevStep === FORM_STEPS.TYPE_SELECT || !prevStep) {
        if (isImagineRoute) {
          void navigate('/imagine');
        } else {
          void navigate(`/studio/${category}${subcategory ? `/${subcategory}` : ''}`);
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
            } else if (result.quote) {
              updateFormData({ quote: result.quote });
            } else if (result.header) {
              updateFormData({
                header: result.header,
                subheader: result.subheader || '',
                body: result.body,
                searchTerms: result.searchTerms || [],
              });
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
          void refetchImageLimit();
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
          void refetchImageLimit();
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
    setGeneratedImage,
    goToNextStep,
    refetchImageLimit,
  ]);

  // Category selector rendering is handled by ImageStudioCategorySelector sub-component

  // Type selector and form fields are handled by sub-components

  // Show loading state while cloning template
  if (isCloning) {
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

  // Show loading state while hydrating an existing sharepic (gallery edit
  // or template clone). Without this guard, InputStep paints for one frame
  // before loadGalleryEditData() flips currentStep to CANVAS_EDIT.
  if (isHydratingExisting) {
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
      </div>
    );
  }

  // Show error if template cloning failed (only when there's actually a template param)
  const hasTemplateParam = searchParams.get('template');
  if (cloneError && hasTemplateParam) {
    console.error('[ImageStudioPage] Clone error display:', cloneError);
    return (
      <div className="container" role="main" aria-label="Image Studio">
        <div className="bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md p-lg shadow-card-elevated overflow-hidden transition-all">
          <h2>Fehler beim Laden der Vorlage</h2>
          <p>{cloneError}</p>
          <Button onClick={() => navigate('/studio')} text="Zurück" icon={<HiArrowLeft />} />
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
        <div className="bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md p-lg shadow-card-elevated overflow-hidden transition-all">
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
