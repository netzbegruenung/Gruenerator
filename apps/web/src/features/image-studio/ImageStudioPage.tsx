import React, { useEffect, useCallback, useMemo, useState, ChangeEvent, ComponentType, FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { HiPhotograph, HiSparkles, HiArrowLeft, HiArrowUp } from 'react-icons/hi';
import { PiFolder, PiLayout, PiUser } from 'react-icons/pi';
import { generateSharepicFromPrompt } from '../../services/sharepicPromptService';
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
  getTypeConfig,
  getCategoryConfig,
  getTypesForCategory,
  getAllKiTypes,
  URL_TYPE_MAP
} from './utils/typeConfig';

import '../../assets/styles/components/sharepic/sharepic-type-selector.css';
import '../../assets/styles/components/form/form-inputs.css';
import '../../assets/styles/components/baseform/form-layout.css';

// Types
interface StartOption {
  id: string;
  category: string | null;
  subcategory: string | null;
  label: string;
  description: string;
  Icon: ComponentType;
  previewImage?: string;
  isComingSoon?: boolean;
  isEarlyAccess?: boolean;
  directType?: string;
}

interface TypeConfig {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType;
  previewImage?: string;
  isBeta?: boolean;
  category?: string;
  subcategory?: string;
  urlSlug?: string;
  hasTextGeneration?: boolean;
  usesFluxApi?: boolean;
  requiresImage?: boolean;
  legacyType?: string;
  endpoints?: { canvas?: string };
  steps?: string[];
  formProps?: Record<string, any>;
  variants?: { value: string; label: string; imageUrl: string }[];
}

interface FormErrors {
  thema?: string;
  description?: string;
  purePrompt?: string;
  sharepicPrompt?: string;
  uploadedImage?: string;
  precisionInstruction?: string;
  selectedInfrastructure?: string;
  [key: string]: string | undefined;
}

interface ImageStudioFormSectionProps {
  type: string;
  currentStep: string;
  typeConfig: TypeConfig | null;
  formErrors: FormErrors;
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  updateFormData: (data: Record<string, any>) => void;
}

interface ImageStudioPageContentProps {
  showHeaderFooter?: boolean;
}

interface ImageStudioPageProps {
  showHeaderFooter?: boolean;
}

// Slogan alternative type for text generation results
interface SloganAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

// URL type map keys
type UrlTypeMapKey = 'dreizeilen' | 'zitat' | 'zitat-pure' | 'info' | 'veranstaltung' | 'text2sharepic' | 'ki' | 'green-edit' | 'ally-maker' | 'universal-edit' | 'pure-create' | 'ki-sharepic';

// Example prompts for the AI chat input
const EXAMPLE_PROMPTS = [
  { icon: '💬', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
  { icon: '📢', text: 'Sharepic mit 3 Zeilen über Windenergie' },
  { icon: 'ℹ️', text: 'Info-Grafik über erneuerbare Energien' }
];

// Sub-component: Category Selector (Templates / KI Create / KI Edit / Vorlagen)
const ImageStudioCategorySelector: React.FC = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
  const { user } = useOptimizedAuth();

  // Chat input state
  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const firstName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const setType = useImageStudioStore((state) => state.setType);

  const handleCategorySelect = useCallback((cat: string | null, subcat: string | null, directType?: string) => {
    if (directType) {
      setType(directType);
      navigate(`/image-studio/templates/${directType}`);
    } else if (cat) {
      setCategory(cat, subcat);
      navigate(`/image-studio/${cat}`);
    }
  }, [setCategory, setType, navigate]);

  // Handle AI prompt submission
  const handlePromptSubmit = useCallback(async (e?: FormEvent) => {
    if (e) e.preventDefault();

    const trimmedPrompt = promptInput.trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const result = await generateSharepicFromPrompt(trimmedPrompt);

      if (!result.success) {
        setGenerationError(result.error || 'Ein Fehler ist aufgetreten');
        setIsGenerating(false);
        return;
      }

      // Load the generated data into the store
      loadFromAIGeneration(result.type, result.data);

      // Navigate to the sharepic edit page
      navigate(`/image-studio/templates/${result.type}`);

    } catch (error: any) {
      console.error('[ImageStudioCategorySelector] Prompt submission error:', error);
      setGenerationError(error.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setIsGenerating(false);
    }
  }, [promptInput, isGenerating, loadFromAIGeneration, navigate]);

  // Handle keyboard submit (Enter without Shift)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  }, [handlePromptSubmit]);

  // Handle example prompt click
  const handleExampleClick = useCallback((text: string) => {
    setPromptInput(text);
  }, []);

  const startOptions: StartOption[] = [
    { id: 'sharepics', category: IMAGE_STUDIO_CATEGORIES.TEMPLATES, subcategory: null, label: 'Sharepics', description: 'Erstelle Sharepics mit vorgefertigten Designs', Icon: PiLayout, previewImage: '/imagine/previews/templates-preview.jpg' },
    { id: 'imagine', category: IMAGE_STUDIO_CATEGORIES.KI, subcategory: null, label: 'Imagine (KI)', description: 'Erstelle oder bearbeite Bilder mit KI', Icon: HiSparkles, previewImage: '/imagine/variants-pure/soft-illustration.png' },
    { id: 'profilbild', category: IMAGE_STUDIO_CATEGORIES.TEMPLATES, subcategory: null, label: 'Profilbild', description: 'Erstelle ein Porträt mit grünem Hintergrund', Icon: PiUser, previewImage: '/imagine/previews/profilbild-preview.png', directType: IMAGE_STUDIO_TYPES.PROFILBILD },
    { id: 'vorlagen', category: null, subcategory: null, label: 'Vorlagen', description: 'Durchsuche vorgefertigte Vorlagen', Icon: PiFolder, previewImage: '/imagine/previews/vorlagen-preview.jpg', isEarlyAccess: true }
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

        {/* AI Prompt Input Section */}
        <motion.div
          className="image-studio-prompt-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className="image-studio-prompt-title">Beschreibe dein Sharepic</h2>

          <form className="image-studio-prompt-form" onSubmit={handlePromptSubmit}>
            <div className="image-studio-prompt-input-container">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="z.B. Erstelle ein Sharepic zum Thema Klimaschutz..."
                disabled={isGenerating}
                rows={2}
                className="image-studio-prompt-input"
              />
              <button
                type="submit"
                className={`image-studio-prompt-submit ${isGenerating ? 'loading' : ''}`}
                disabled={!promptInput.trim() || isGenerating}
                aria-label="Sharepic generieren"
              >
                {isGenerating ? (
                  <span className="spinner-small" />
                ) : (
                  <HiArrowUp />
                )}
              </button>
            </div>
          </form>

          {generationError && (
            <motion.p
              className="image-studio-prompt-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {generationError}
            </motion.p>
          )}

          <div className="image-studio-prompt-examples">
            {EXAMPLE_PROMPTS.map((example, index) => (
              <button
                key={index}
                type="button"
                className="image-studio-prompt-example"
                onClick={() => handleExampleClick(example.text)}
                disabled={isGenerating}
              >
                <span>{example.icon}</span>
                <span>{example.text}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Section Divider */}
        <div className="image-studio-divider">
          <span>Oder wähle eine vordefinierte Route</span>
        </div>

        {/* Existing Category Cards */}
        <div className="type-options-grid type-options-grid--four">
          {startOptions.map((option) => (
            <div
              key={option.id}
              className={`type-card ${option.previewImage ? 'type-card--image gradient-dark' : ''} ${option.isComingSoon ? 'coming-soon' : ''}`}
              onClick={() => !option.isComingSoon && (option.isEarlyAccess ? navigate('/datenbank/vorlagen') : handleCategorySelect(option.category, option.subcategory, option.directType))}
              role="button"
              tabIndex={option.isComingSoon ? -1 : 0}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && !option.isComingSoon && (option.isEarlyAccess ? navigate('/datenbank/vorlagen') : handleCategorySelect(option.category, option.subcategory, option.directType))}
            >
              {option.isComingSoon && <span className="coming-soon-badge">Coming Soon</span>}
              {option.isEarlyAccess && <span className="beta-badge">Early Access</span>}
              {option.previewImage ? (
                <>
                  <img src={option.previewImage} alt={option.label} className="type-card__image" />
                  <h3>{option.label}</h3>
                  <p className="type-card__description">{option.description}</p>
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
const ImageStudioTypeSelector: React.FC = () => {
  const navigate = useNavigate();
  const category = useImageStudioStore((state) => state.category);
  const setType = useImageStudioStore((state) => state.setType);

  const categoryConfig = useMemo(() => getCategoryConfig(category), [category]);
  const typesInCategory = useMemo(() => {
    if (!category) return [];
    return getTypesForCategory(category);
  }, [category]);

  // Wait for category to be set
  if (!category) return null;

  const handleTypeSelect = useCallback((selectedType: string) => {
    setType(selectedType);
    const config = getTypeConfig(selectedType) as TypeConfig | null;
    const urlSegment = config?.urlSlug || selectedType;
    navigate(`/image-studio/${config?.category || category}/${urlSegment}`);
  }, [setType, navigate, category]);

  // KI category - show all variants and edit types in one grid
  if (category === IMAGE_STUDIO_CATEGORIES.KI) {
    const allKiTypes = getAllKiTypes();
    const editTypes = allKiTypes.filter(t => t.subcategory === KI_SUBCATEGORIES.EDIT);

    // Get variants for pure-create (the style options)
    const pureCreateConfig = TYPE_CONFIG[IMAGE_STUDIO_TYPES.PURE_CREATE];
    const createVariants = pureCreateConfig?.variants || [];

    const handleVariantSelect = (selectedVariant: string) => {
      setType(IMAGE_STUDIO_TYPES.PURE_CREATE);
      const store = useImageStudioStore.getState();
      store.updateFormData({ variant: selectedVariant });
      navigate(`/image-studio/ki/pure-create`);
    };

    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <div className="type-selector-header-wrapper">
            <h1>Imagine (KI)</h1>
          </div>
          <div className="type-options-grid type-options-grid--five">
            {editTypes.map((config) => (
              <div key={config.id} className={`type-card type-card--image no-overlay ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <img src={config.previewImage} alt={config.label} className="type-card__image" />
                <h3>{config.label}</h3>
                <p className="type-card__description">{config.description}</p>
              </div>
            ))}
            {createVariants.map((variant: { value: string; label: string; description: string; imageUrl: string }) => (
              <div key={variant.value} className="type-card type-card--image no-overlay" onClick={() => handleVariantSelect(variant.value)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleVariantSelect(variant.value)}>
                <img src={variant.imageUrl} alt={variant.label} className="type-card__image" />
                <h3>{variant.label}</h3>
                <p className="type-card__description">{variant.description}</p>
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
                <div key={config.id} className={`type-card type-card--image no-overlay ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                  {config.isBeta && <span className="beta-badge">Beta</span>}
                  <img src={config.previewImage} alt={config.label} className="type-card__image" />
                  <h3>{config.label}</h3>
                </div>
              ) : (
                <div key={config.id} className={`type-card ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTypeSelect(config.id)}>
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

  // Standard type selector fallback (should not be reached with current flow)
  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <div className="type-selector-header-wrapper">
          <h1>{categoryConfig?.label}</h1>
          <p className="type-selector-intro">{categoryConfig?.description}</p>
        </div>
        <div className="type-options-grid">
          {typesInCategory.map((config) => {
            const Icon = config.icon || HiPhotograph;
            return config.previewImage ? (
              <div key={config.id} className={`type-card type-card--image ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTypeSelect(config.id)}>
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <img src={config.previewImage} alt={config.label} className="type-card__image" />
                <h3>{config.label}</h3>
              </div>
            ) : (
              <div key={config.id} className={`type-card ${config.isBeta ? 'beta' : ''}`} onClick={() => handleTypeSelect(config.id)} role="button" tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTypeSelect(config.id)}>
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
const ImageStudioFormSection: React.FC<ImageStudioFormSectionProps> = ({ type, currentStep, typeConfig, formErrors, handleChange, updateFormData }) => {
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
          <textarea id="purePrompt" name="purePrompt" value={purePrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateFormData({ purePrompt: e.target.value })} placeholder="Beschreibe das Bild, das du erstellen möchtest..." rows={4} className={`form-textarea ${formErrors.purePrompt ? 'error-input' : ''}`} />
          {formErrors.purePrompt && <span className="error-message">{formErrors.purePrompt}</span>}
        </div>
      );
    }
    if (type === IMAGE_STUDIO_TYPES.KI_SHAREPIC) {
      return (
        <>
          <div className="form-field-wrapper">
            <h3><label htmlFor="sharepicPrompt">Bildbeschreibung</label></h3>
            <textarea id="sharepicPrompt" name="sharepicPrompt" value={sharepicPrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateFormData({ sharepicPrompt: e.target.value })} placeholder="Beschreibe das Bild..." rows={4} className={`form-textarea ${formErrors.sharepicPrompt ? 'error-input' : ''}`} />
            {formErrors.sharepicPrompt && <span className="error-message">{formErrors.sharepicPrompt}</span>}
          </div>
          <div className="form-field-wrapper">
            <h3><label htmlFor="imagineTitle">Titel</label></h3>
            <input type="text" id="imagineTitle" name="imagineTitle" value={imagineTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData({ imagineTitle: e.target.value })} placeholder="Titel für das Sharepic..." className="form-input" />
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

const ImageStudioPageContent: React.FC<ImageStudioPageContentProps> = ({ showHeaderFooter = true }) => {
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
    loadGalleryEditData, loadEditSessionData, galleryEditMode, editShareToken,
    aiGeneratedContent
  } = useImageStudioStore();

  const { generateText, generateImage, loading, error, setError } = useImageGeneration();
  const { data: imageLimitData, refetch: refetchImageLimit } = useImageGenerationLimit();

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isAlternativesExpanded, setIsAlternativesExpanded] = useState(false);

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);

  useEffect(() => {
    if (!urlCategory) return;

    // Skip URL sync when content was generated via AI prompt (state is already set correctly)
    if (aiGeneratedContent) return;

    // Check if urlType is actually a subcategory (create/edit)
    const isSubcategory = urlType && Object.values(KI_SUBCATEGORIES).includes(urlType);

    if (isSubcategory) {
      // URL: /image-studio/ki/create or /image-studio/ki/edit
      if (!category || !subcategory || subcategory !== urlType) {
        setCategory(urlCategory, urlType);
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
    handleChange: (file: File | string | null) => updateFormData({ uploadedImage: file }),
    file: uploadedImage,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    alternativesButtonProps: {
      isExpanded: isAlternativesExpanded,
      onClick: () => setIsAlternativesExpanded(!isAlternativesExpanded),
      onSloganSelect: (selected: SloganAlternative) => {
        updateFormData({
          line1: selected.line1 || '',
          line2: selected.line2 || '',
          line3: selected.line3 || ''
        });
      }
    }
  };

  const handleControlChange = (name: string, value: string | number | boolean) => {
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

const ImageStudioPage: React.FC<ImageStudioPageProps> = ({ showHeaderFooter = true }) => {
  return <ImageStudioPageContent showHeaderFooter={showHeaderFooter} />;
};

export default withAuthRequired(ImageStudioPage);
