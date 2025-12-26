import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { HiPhotograph, HiSparkles, HiArrowLeft, HiPencilAlt } from 'react-icons/hi';
import { PiFolder, PiLayout } from 'react-icons/pi';
import useImageStudioStore from '../../stores/imageStudioStore';
import TemplateStudioFlow from './flows/TemplateStudioFlow';
import { EditInstructionForm } from './forms';
import { useImageGeneration } from './hooks/useImageGeneration';
import useImageGenerationLimit from '../../hooks/useImageGenerationLimit';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { useOptimizedAuth } from '../../hooks/useAuth';
import ErrorBoundary from '../../components/ErrorBoundary';
import Button from '../../components/common/SubmitButton';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  TYPE_CONFIG,
  CATEGORY_CONFIG,
  KI_SUBCATEGORY_CONFIG,
  getTypeConfig,
  getCategoryConfig,
  getTypesForCategory,
  getTypesForSubcategory,
  getSubcategoryConfig,
  URL_TYPE_MAP
} from './utils/typeConfig';

import '../../assets/styles/components/sharepic/sharepic-type-selector.css';
import '../../assets/styles/components/form/form-inputs.css';
import '../../assets/styles/components/baseform/form-layout.css';

// Sub-component: Category Selector (Templates / KI Create / KI Edit / Vorlagen)
const ImageStudioCategorySelector = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const { user } = useOptimizedAuth();

  const firstName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const handleCategorySelect = useCallback((cat, subcat) => {
    setCategory(cat, subcat);
    if (cat === IMAGE_STUDIO_CATEGORIES.KI && subcat) {
      navigate(`/image-studio/ki/${subcat}`);
    } else if (cat) {
      navigate(`/image-studio/${cat}`);
    }
  }, [setCategory, navigate]);

  const startOptions = [
    { id: 'templates', category: IMAGE_STUDIO_CATEGORIES.TEMPLATES, subcategory: null, label: 'Templates', description: 'Sharepics mit vorgefertigten Designs', Icon: PiLayout, previewImage: '/imagine/previews/templates-preview.jpg' },
    { id: 'ki-create', category: IMAGE_STUDIO_CATEGORIES.KI, subcategory: KI_SUBCATEGORIES.CREATE, label: 'Mit KI Generieren', description: 'Neue Bilder aus Text erstellen', Icon: HiSparkles, previewImage: KI_SUBCATEGORY_CONFIG[KI_SUBCATEGORIES.CREATE]?.previewImage },
    { id: 'ki-edit', category: IMAGE_STUDIO_CATEGORIES.KI, subcategory: KI_SUBCATEGORIES.EDIT, label: 'Mit KI Editieren', description: 'Bestehende Bilder mit KI bearbeiten', Icon: HiPencilAlt, previewImage: KI_SUBCATEGORY_CONFIG[KI_SUBCATEGORIES.EDIT]?.previewImage },
    { id: 'vorlagen', category: null, subcategory: null, label: 'Vorlagen', description: 'Vorgefertigte Vorlagen durchsuchen', Icon: PiFolder, previewImage: '/imagine/previews/vorlagen-preview.jpg', isComingSoon: true }
  ];

  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <div className="type-selector-header-row">
          <h1>{firstName ? `Willkommen im Image-Studio, ${firstName}` : 'Willkommen im Image-Studio'}</h1>
          <button className="btn-secondary" onClick={() => navigate('/image-studio/gallery')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)' }}>
            <PiFolder /> Meine Bilder
          </button>
        </div>
        <div className="type-options-grid type-options-grid--four">
          {startOptions.map((option) => (
            <div
              key={option.id}
              className={`type-card ${option.previewImage ? 'type-card--image gradient-dark' : ''} ${option.isComingSoon ? 'coming-soon' : ''}`}
              onClick={() => !option.isComingSoon && handleCategorySelect(option.category, option.subcategory)}
              role="button"
              tabIndex={option.isComingSoon ? -1 : 0}
              onKeyDown={(e) => e.key === 'Enter' && !option.isComingSoon && handleCategorySelect(option.category, option.subcategory)}
            >
              {option.isComingSoon && <span className="coming-soon-badge">Coming Soon</span>}
              {option.previewImage ? (
                <>
                  <img src={option.previewImage} alt={option.label} className="type-card__image" />
                  <h3>{option.label}</h3>
                </>
              ) : (
                <>
                  <div className="type-icon"><option.Icon /></div>
                  <h3>{option.label}</h3>
                  <p>{option.description}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Sub-component: Type Selector (shows types within a category/subcategory)
const ImageStudioTypeSelector = () => {
  const navigate = useNavigate();
  const category = useImageStudioStore((state) => state.category);
  const subcategory = useImageStudioStore((state) => state.subcategory);
  const setType = useImageStudioStore((state) => state.setType);
  const updateFormData = useImageStudioStore((state) => state.updateFormData);
  const goToNextStep = useImageStudioStore((state) => state.goToNextStep);

  const categoryConfig = useMemo(() => getCategoryConfig(category), [category]);
  const subcategoryConfig = useMemo(() => getSubcategoryConfig(subcategory), [subcategory]);
  const typesInCategory = useMemo(() => {
    if (!category) return [];
    if (category === IMAGE_STUDIO_CATEGORIES.KI && subcategory) {
      return getTypesForSubcategory(subcategory);
    }
    return getTypesForCategory(category);
  }, [category, subcategory]);

  // Wait for category to be set
  if (!category) return null;

  const handleTypeSelect = useCallback((selectedType) => {
    setType(selectedType);
    const config = getTypeConfig(selectedType);
    const urlSegment = config?.urlSlug || selectedType;
    navigate(`/image-studio/${config?.category || category}/${urlSegment}`);
    goToNextStep();
  }, [setType, navigate, category, goToNextStep]);

  const handleVariantSelect = useCallback((selectedType, selectedVariant) => {
    setType(selectedType);
    updateFormData({ variant: selectedVariant });
    const config = getTypeConfig(selectedType);
    const urlSegment = config?.urlSlug || selectedType;
    navigate(`/image-studio/${config?.category || category}/${urlSegment}`);
    goToNextStep();
  }, [setType, updateFormData, navigate, category, goToNextStep]);

  // For KI Generieren (CREATE subcategory), show variants directly instead of types
  if (subcategory === KI_SUBCATEGORIES.CREATE) {
    const pureCreateConfig = TYPE_CONFIG[IMAGE_STUDIO_TYPES.PURE_CREATE];
    const variants = pureCreateConfig?.variants || [];

    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <div className="type-selector-header-wrapper">
            <h1>{subcategoryConfig?.label || 'Mit KI Generieren'}</h1>
          </div>
          <div className="type-options-grid type-options-grid--variants">
            {variants.map((variant) => (
              <div key={variant.value} className="type-card type-card--image" onClick={() => handleVariantSelect(IMAGE_STUDIO_TYPES.PURE_CREATE, variant.value)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleVariantSelect(IMAGE_STUDIO_TYPES.PURE_CREATE, variant.value)}>
                <img src={variant.imageUrl} alt={variant.label} className="type-card__image" />
                <h3>{variant.label}</h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Templates category - use 4-grid design with filtered types
  if (category === IMAGE_STUDIO_CATEGORIES.TEMPLATES) {
    const filteredTypes = typesInCategory.filter((config) => config.id !== IMAGE_STUDIO_TYPES.TEXT2SHAREPIC);

    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <div className="type-selector-header-wrapper">
            <h1>Wie soll dein Sharepic aussehen?</h1>
          </div>
          <div className="type-options-grid type-options-grid--four">
            {filteredTypes.map((config) => {
              const Icon = config.icon || HiPhotograph;
              return config.previewImage ? (
                <div key={config.id} className={`type-card type-card--image no-overlay ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                  {config.isBeta && <span className="beta-badge">Beta</span>}
                  <img src={config.previewImage} alt={config.label} className="type-card__image" />
                  <h3>{config.label}</h3>
                </div>
              ) : (
                <div key={config.id} className={`type-card ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                  {config.isBeta && <span className="beta-badge">Beta</span>}
                  <div className="type-icon"><Icon /></div>
                  <h3>{config.label}</h3>
                  <p>{config.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Standard type selector for other categories/subcategories
  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <div className="type-selector-header-wrapper">
          <h1>{subcategoryConfig?.label || categoryConfig?.label}</h1>
          <p className="type-selector-intro">{subcategoryConfig?.description || categoryConfig?.description}</p>
        </div>
        <div className="type-options-grid">
          {typesInCategory.map((config) => {
            const Icon = config.icon || HiPhotograph;
            return config.previewImage ? (
              <div key={config.id} className={`type-card type-card--image ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <img src={config.previewImage} alt={config.label} className="type-card__image" />
                <h3>{config.label}</h3>
              </div>
            ) : (
              <div key={config.id} className={`type-card ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <div className="type-icon"><Icon /></div>
                <h3>{config.label}</h3>
                <p>{config.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Sub-component: Form Section (renders different form fields based on type and step)
const ImageStudioFormSection = ({ type, currentStep, typeConfig, formErrors, handleChange, updateFormData }) => {
  const { thema, details, description, mood, purePrompt, sharepicPrompt, imagineTitle, quote, header, subheader, body, line1, line2, line3 } = useImageStudioStore();
  const loading = false; // Loading is managed by parent

  if (typeConfig?.hasTextGeneration && currentStep === FORM_STEPS.INPUT) {
    return (
      <>
        <div className="form-field-wrapper">
          <h3><label htmlFor="thema">Thema</label></h3>
          <input type="text" id="thema" name="thema" value={thema} onChange={handleChange} placeholder="z.B. Klimaschutz, Verkehrswende..." className={`form-input ${formErrors.thema ? 'error-input' : ''}`} />
          {formErrors.thema && <span className="error-message">{formErrors.thema}</span>}
        </div>
        <div className="form-field-wrapper">
          <h3><label htmlFor="details">Details (optional)</label></h3>
          <textarea id="details" name="details" value={details} onChange={handleChange} placeholder="Zusätzliche Informationen..." rows={3} className="form-textarea" />
        </div>
      </>
    );
  }

  if (type === IMAGE_STUDIO_TYPES.TEXT2SHAREPIC && currentStep === FORM_STEPS.INPUT) {
    return (
      <>
        <div className="form-field-wrapper">
          <h3><label htmlFor="description">Beschreibung</label></h3>
          <textarea id="description" name="description" value={description} onChange={handleChange} placeholder="Beschreibe dein Sharepic..." rows={4} className={`form-textarea ${formErrors.description ? 'error-input' : ''}`} />
          {formErrors.description && <span className="error-message">{formErrors.description}</span>}
        </div>
        <div className="form-field-wrapper">
          <h3><label htmlFor="mood">Stimmung (optional)</label></h3>
          <input type="text" id="mood" name="mood" value={mood} onChange={handleChange} placeholder="z.B. optimistisch, nachdenklich..." className="form-input" />
        </div>
      </>
    );
  }

  if (typeConfig?.usesFluxApi && currentStep === FORM_STEPS.INPUT) {
    if (type === IMAGE_STUDIO_TYPES.PURE_CREATE) {
      return (
        <div className="form-field-wrapper">
          <h3><label htmlFor="purePrompt">Bildbeschreibung</label></h3>
          <textarea id="purePrompt" name="purePrompt" value={purePrompt} onChange={(e) => updateFormData({ purePrompt: e.target.value })} placeholder="Beschreibe das Bild, das du erstellen möchtest..." rows={4} className={`form-textarea ${formErrors.purePrompt ? 'error-input' : ''}`} />
          {formErrors.purePrompt && <span className="error-message">{formErrors.purePrompt}</span>}
        </div>
      );
    }
    if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC) {
      return (
        <>
          <div className="form-field-wrapper">
            <h3><label htmlFor="sharepicPrompt">Bildbeschreibung</label></h3>
            <textarea id="sharepicPrompt" name="sharepicPrompt" value={sharepicPrompt} onChange={(e) => updateFormData({ sharepicPrompt: e.target.value })} placeholder="Beschreibe das Bild..." rows={4} className={`form-textarea ${formErrors.sharepicPrompt ? 'error-input' : ''}`} />
            {formErrors.sharepicPrompt && <span className="error-message">{formErrors.sharepicPrompt}</span>}
          </div>
          <div className="form-field-wrapper">
            <h3><label htmlFor="imagineTitle">Titel</label></h3>
            <input type="text" id="imagineTitle" name="imagineTitle" value={imagineTitle} onChange={(e) => updateFormData({ imagineTitle: e.target.value })} placeholder="Titel für das Sharepic..." className="form-input" />
          </div>
        </>
      );
    }
    if (typeConfig?.formProps) {
      return <EditInstructionForm {...typeConfig.formProps} loading={loading} formErrors={formErrors} />;
    }
    return (
      <div className="form-field-wrapper">
        <p>Lade ein Bild hoch um fortzufahren.</p>
        {formErrors.uploadedImage && <span className="error-message">{formErrors.uploadedImage}</span>}
      </div>
    );
  }

  if (currentStep === FORM_STEPS.PREVIEW || currentStep === FORM_STEPS.RESULT) {
    if (typeConfig?.legacyType === 'Zitat' || typeConfig?.legacyType === 'Zitat_Pure') {
      return (
        <div className="form-field-wrapper">
          <h3><label htmlFor="quote">Zitat</label></h3>
          <textarea id="quote" name="quote" value={quote} onChange={handleChange} rows={3} className="form-textarea" />
        </div>
      );
    }
    if (typeConfig?.legacyType === 'Info') {
      return (
        <>
          <div className="form-field-wrapper">
            <h3><label htmlFor="header">Header</label></h3>
            <input type="text" id="header" name="header" value={header} onChange={handleChange} className="form-input" />
          </div>
          <div className="form-field-wrapper">
            <h3><label htmlFor="subheader">Subheader</label></h3>
            <input type="text" id="subheader" name="subheader" value={subheader} onChange={handleChange} className="form-input" />
          </div>
          <div className="form-field-wrapper">
            <h3><label htmlFor="body">Body</label></h3>
            <textarea id="body" name="body" value={body} onChange={handleChange} rows={3} className="form-textarea" />
          </div>
        </>
      );
    }
    return (
      <>
        <div className="form-field-wrapper">
          <h3><label htmlFor="line1">Zeile 1</label></h3>
          <input type="text" id="line1" name="line1" value={line1} onChange={handleChange} className="form-input" />
        </div>
        <div className="form-field-wrapper">
          <h3><label htmlFor="line2">Zeile 2</label></h3>
          <input type="text" id="line2" name="line2" value={line2} onChange={handleChange} className="form-input" />
        </div>
        <div className="form-field-wrapper">
          <h3><label htmlFor="line3">Zeile 3</label></h3>
          <input type="text" id="line3" name="line3" value={line3} onChange={handleChange} className="form-input" />
        </div>
      </>
    );
  }

  return null;
};

const ImageStudioPageContent = ({ showHeaderFooter = true }) => {
  const { category: urlCategory, type: urlType } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    category, subcategory, type, currentStep,
    setCategory, setType, setCurrentStep, goBack,
    thema, details, line1, line2, line3, quote, name,
    header, subheader, body, description, mood,
    fontSize, balkenOffset, colorScheme,
    balkenGruppenOffset, sunflowerOffset, credit,
    uploadedImage, generatedImageSrc, sloganAlternatives,
    precisionMode, precisionInstruction, selectedInfrastructure,
    variant, imagineTitle, purePrompt, sharepicPrompt,
    handleChange, updateFormData, setGeneratedImage,
    setSloganAlternatives, goToNextStep, resetStore,
    loadGalleryEditData, loadEditSessionData, galleryEditMode, editShareToken
  } = useImageStudioStore();

  const { generateText, generateImage, loading, error, setError } = useImageGeneration();
  const { data: imageLimitData, refetch: refetchImageLimit } = useImageGenerationLimit();

  const [formErrors, setFormErrors] = useState({});
  const [isAlternativesExpanded, setIsAlternativesExpanded] = useState(false);

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);

  useEffect(() => {
    if (!urlCategory) return;

    // Check if urlType is actually a subcategory (create/edit)
    const isSubcategory = urlType && Object.values(KI_SUBCATEGORIES).includes(urlType);

    if (isSubcategory) {
      // URL: /image-studio/ki/create or /image-studio/ki/edit
      if (!category || !subcategory || subcategory !== urlType) {
        setCategory(urlCategory, urlType);
      }
    } else if (urlType) {
      // URL: /image-studio/ki/green-edit (actual type)
      const mappedType = URL_TYPE_MAP[urlType] || urlType;
      if (mappedType && TYPE_CONFIG[mappedType] && !type) {
        setCategory(TYPE_CONFIG[mappedType].category, TYPE_CONFIG[mappedType].subcategory);
        setType(mappedType);
      }
    } else if (!category) {
      // URL: /image-studio/templates or /image-studio/ki (without subcategory)
      setCategory(urlCategory);
    }
  }, [urlCategory, urlType, category, subcategory, type, setCategory, setType]);

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
      resetStore();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.TYPE_SELECT) {
      setCategory(null, null);
      navigate('/image-studio');
    } else if (currentStep === FORM_STEPS.IMAGE_UPLOAD) {
      goBack();
      navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
    } else if (currentStep === FORM_STEPS.INPUT) {
      const prevStep = typeConfig?.steps?.[typeConfig.steps.indexOf(currentStep) - 1];
      goBack();
      if (prevStep === FORM_STEPS.TYPE_SELECT || !prevStep) {
        navigate(`/image-studio/${category}${subcategory ? `/${subcategory}` : ''}`);
      }
    } else {
      goBack();
    }
  }, [currentStep, category, subcategory, typeConfig, goBack, setCategory, navigate]);

  const validateForm = useCallback(() => {
    const errors = {};

    if (currentStep === FORM_STEPS.INPUT) {
      if (typeConfig?.hasTextGeneration) {
        if (!thema || thema.trim().length < 3) {
          errors.thema = 'Bitte gib ein Thema ein (mindestens 3 Zeichen)';
        }
      }

      if (type === IMAGE_STUDIO_TYPES.TEXT2SHAREPIC) {
        if (!description || description.trim().length < 5) {
          errors.description = 'Bitte beschreibe dein Sharepic (mindestens 5 Zeichen)';
        }
      }

      if (typeConfig?.usesFluxApi) {
        if (type === IMAGE_STUDIO_TYPES.PURE_CREATE && (!purePrompt || purePrompt.trim().length < 5)) {
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
  }, [currentStep, typeConfig, type, thema, description, purePrompt, sharepicPrompt, uploadedImage, precisionMode, precisionInstruction, selectedInfrastructure]);

  const handleFormSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      if (currentStep === FORM_STEPS.INPUT) {
        if (typeConfig?.hasTextGeneration) {
          const result = await generateText(type, {
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

          const image = await generateImage(type, formData);
          setGeneratedImage(image);
          refetchImageLimit();
          goToNextStep();
        } else if (type === IMAGE_STUDIO_TYPES.TEXT2SHAREPIC) {
          const image = await generateImage(type, { description, mood });
          setGeneratedImage(image);
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

        const image = await generateImage(type, formData);
        setGeneratedImage(image);
        goToNextStep();
      } else if (currentStep === FORM_STEPS.RESULT) {
        if (typeConfig?.usesFluxApi) {
          const formData = {
            purePrompt, sharepicPrompt, imagineTitle, variant,
            uploadedImage, precisionMode, precisionInstruction,
            selectedInfrastructure
          };

          const image = await generateImage(type, formData);
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

          const image = await generateImage(type, formData);
          setGeneratedImage(image);
        }
      }
    } catch (err) {
      console.error('[ImageStudioPage] Form submission error:', err);
    }
  }, [
    currentStep, type, typeConfig, validateForm, generateText, generateImage,
    thema, details, name, line1, line2, line3, quote,
    header, subheader, body, description, mood,
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

  const fileUploadProps = {
    handleChange: (file) => updateFormData({ uploadedImage: file }),
    file: uploadedImage,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    alternativesButtonProps: {
      isExpanded: isAlternativesExpanded,
      onClick: () => setIsAlternativesExpanded(!isAlternativesExpanded),
      onSloganSelect: (selected) => {
        updateFormData({
          line1: selected.line1 || '',
          line2: selected.line2 || '',
          line3: selected.line3 || ''
        });
      }
    }
  };

  const handleControlChange = (name, value) => {
    updateFormData({ [name]: value });
  };

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

const ImageStudioPage = ({ showHeaderFooter = true }) => {
  return <ImageStudioPageContent showHeaderFooter={showHeaderFooter} />;
};

export default withAuthRequired(ImageStudioPage);
