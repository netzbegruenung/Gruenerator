import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { HiSparkles } from 'react-icons/hi';
import { PiFolder, PiLayout, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import { PromptInput, type PromptExample } from '../../../components/common/PromptInput';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useRecentValues } from '../../../hooks/useRecentValues';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useRecentGalleryItems, type RecentGalleryItem } from '../hooks/useRecentGalleryItems';
import { type StartOption } from '../types/componentTypes';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, getTypeConfig } from '../utils/typeConfig';

import type { TypeConfig } from '../utils/typeConfig/types';

import '../image-studio-shared.css';
import './ImageStudioCategorySelector.css';

const EXAMPLE_PROMPTS: PromptExample[] = [
  { label: 'Zitat', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
  { label: 'Sharepic', text: 'Sharepic mit 3 Zeilen über Windenergie' },
  { label: 'Info', text: 'Info-Grafik über erneuerbare Energien' },
];

const ImageStudioCategorySelector: React.FC = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
  const setType = useImageStudioStore((state) => state.setType);
  const { user } = useOptimizedAuth();

  // Chat input state
  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const firstName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  // Recent gallery items - actual saved sharepics that can be edited
  const recentGalleryOptions = useMemo(() => ({ limit: 6 }), []);
  const { items: recentGalleryItems, lastFetch: galleryLastFetch } =
    useRecentGalleryItems(recentGalleryOptions);
  const showGallerySection = galleryLastFetch !== null && recentGalleryItems.length > 0;

  // Last used types - fetched from PostgreSQL via useRecentValues
  // Memoize options to prevent unnecessary hook re-runs
  const recentValuesOptions = useMemo(() => ({ limit: 6 }), []);
  const { recentValues, lastFetch } = useRecentValues('image_studio_type', recentValuesOptions);

  // Map type IDs to configs for display
  const recentTypeConfigs = useMemo(() => {
    return recentValues
      .map((typeId) => getTypeConfig(typeId))
      .filter((config): config is TypeConfig => config !== null && !config.hidden);
  }, [recentValues]);

  // Only show section after initial load completes (lastFetch !== null means data was loaded)
  const showRecentTypesSection = lastFetch !== null && recentTypeConfigs.length > 0;

  // Check if user is Austrian (used to redirect Sharepics to external tool and hide prompt)
  const isAustrianUser = user?.locale === 'de-AT';

  const handleCategorySelect = useCallback(
    (cat: string | null, subcat: string | null, directType?: string) => {
      if (directType) {
        void setType(directType);
        void navigate(`/image-studio/templates/${directType}`);
      } else if (cat) {
        void setCategory(cat, subcat);
        void navigate(`/image-studio/${cat}`);
      }
    },
    [setCategory, setType, navigate]
  );

  // Handle editing a recent gallery item (reuses gallery edit pattern)
  const handleGalleryItemEdit = useCallback(
    (item: RecentGalleryItem) => {
      const metadata = item.imageMetadata || {};
      const sharepicType = metadata.sharepicType;

      if (!sharepicType) {
        console.warn('[ImageStudioCategorySelector] Cannot edit: no sharepicType in metadata');
        return;
      }

      // Map both legacy capitalized format AND modern lowercase format to routes
      const typeRouteMap: Record<string, string> = {
        // Modern lowercase format (from canvas auto-save)
        dreizeilen: '/image-studio/templates/dreizeilen',
        zitat: '/image-studio/templates/zitat',
        'zitat-pure': '/image-studio/templates/zitat-pure',
        info: '/image-studio/templates/info',
        headline: '/image-studio/templates/headline',
        // Legacy capitalized format (for backwards compatibility)
        Dreizeilen: '/image-studio/templates/dreizeilen',
        Zitat: '/image-studio/templates/zitat',
        Zitat_Pure: '/image-studio/templates/zitat-pure',
        Info: '/image-studio/templates/info',
        Headline: '/image-studio/templates/headline',
      };

      const route = typeRouteMap[sharepicType];
      if (!route) {
        console.warn('[ImageStudioCategorySelector] Unknown sharepic type:', sharepicType);
        return;
      }

      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

      void navigate(route, {
        state: {
          galleryEditMode: true,
          shareToken: item.shareToken,
          content: { ...metadata.content, sharepicType },
          styling: metadata.styling || {},
          originalImageUrl: `${baseURL}/share/${item.shareToken}/original`,
          title: item.title,
        },
      });
    },
    [navigate]
  );

  // Handle AI prompt submission
  const handlePromptSubmit = useCallback(
    async (e?: FormEvent) => {
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

        // Handle KI types - navigate to KI creation flow
        if (result.isKiType) {
          void navigate(`/image-studio/ki/create/pure-create`);
          return;
        }

        // Load the generated data into the store (including selected image if available)
        loadFromAIGeneration(
          result.type,
          result.data as unknown as Record<string, string>,
          result.selectedImage
        );

        // Navigate to the sharepic edit page
        void navigate(`/image-studio/templates/${result.type}`);
      } catch (error: unknown) {
        console.error('[ImageStudioCategorySelector] Prompt submission error:', error);
        setGenerationError(
          (error instanceof Error ? error.message : String(error)) || 'Ein Fehler ist aufgetreten'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [promptInput, isGenerating, loadFromAIGeneration, navigate]
  );

  const startOptions: StartOption[] = useMemo(
    () => [
      {
        id: 'sharepics',
        category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
        subcategory: null,
        label: 'Sharepics',
        description: 'Erstelle Sharepics mit vorgefertigten Designs',
        Icon: PiLayout,
        previewImage: '/imagine/previews/dreizeilen-preview.png',
      },
      {
        id: 'imagine',
        category: IMAGE_STUDIO_CATEGORIES.KI,
        subcategory: null,
        label: 'Imagine (KI)',
        description: 'Erstelle oder bearbeite Bilder mit KI',
        Icon: HiSparkles,
        previewImage: '/imagine/variants-pure/soft-illustration.png',
      },
      {
        id: 'vorlagen',
        category: null,
        subcategory: null,
        label: 'Vorlagen',
        description: 'Durchsuche vorgefertigte Vorlagen',
        Icon: PiFolder,
        previewImage: '/imagine/previews/vorlagen-preview.jpg',
        // Austrian users see "coming soon", others see "early access" with link
        isEarlyAccess: !isAustrianUser,
        isComingSoon: isAustrianUser,
      },
      {
        id: 'profilbild',
        category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
        subcategory: null,
        label: 'Profilbild',
        description: 'Erstelle ein Porträt mit grünem Hintergrund',
        Icon: PiUser,
        previewImage: '/imagine/previews/profilbild-preview.png',
        directType: IMAGE_STUDIO_TYPES.PROFILBILD,
        isComingSoon: true,
      },
    ],
    [isAustrianUser]
  );

  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <div className="type-selector-header-row">
          <h1>{firstName ? `Hallo, ${firstName}!` : 'Willkommen im Image-Studio'}</h1>
          <button
            className="btn-secondary"
            onClick={() => navigate('/image-studio/gallery')}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)' }}
          >
            <PiFolder /> Meine Bilder
          </button>
        </div>

        <EarlyAccessBanner />

        {/* AI Prompt Input Section - Hidden for Austrian users */}
        {!isAustrianUser && (
          <PromptInput
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handlePromptSubmit}
            placeholder="Beschreibe dein Sharepic..."
            isLoading={isGenerating}
            error={generationError}
            examples={EXAMPLE_PROMPTS}
            submitLabel="Sharepic generieren"
          />
        )}

        {/* Recent Sections - Side by side when both exist */}
        {(showGallerySection || showRecentTypesSection) &&
          (showGallerySection && showRecentTypesSection ? (
            <div className="image-studio-recent-sections-row">
              {/* Recent Gallery Items - Editable saved sharepics */}
              <div className="image-studio-recent-section">
                <h3 className="image-studio-section-title">Zuletzt erstellt</h3>
                <p className="image-studio-section-subtitle">Deine gespeicherten Sharepics</p>
                <div className="image-studio-recent-grid image-studio-gallery-grid">
                  {recentGalleryItems.map((item) => {
                    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
                    const thumbnailUrl = item.thumbnailPath
                      ? `${baseURL}/share/${item.shareToken}/thumbnail`
                      : `${baseURL}/share/${item.shareToken}/preview`;
                    return (
                      <div
                        key={item.shareToken}
                        className="image-studio-recent-card image-studio-gallery-card"
                        onClick={() => handleGalleryItemEdit(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleGalleryItemEdit(item)}
                      >
                        <img src={thumbnailUrl} alt={item.title || 'Sharepic'} />
                        <span>{item.title || 'Sharepic'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Template Types - Quick access to template types */}
              <div className="image-studio-recent-section">
                <h3 className="image-studio-section-title">Zuletzt verwendete Vorlagen</h3>
                <p className="image-studio-section-subtitle">Schnellzugriff auf deine Favoriten</p>
                <div className="image-studio-recent-grid">
                  {recentTypeConfigs.map((config) => (
                    <div
                      key={config.id}
                      className="image-studio-recent-card"
                      onClick={() => handleCategorySelect(config.category, null, config.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && handleCategorySelect(config.category, null, config.id)
                      }
                    >
                      {config.previewImage && <img src={config.previewImage} alt={config.label} />}
                      <span>{config.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Single section display - full width */}
              {showGallerySection && (
                <div className="image-studio-recent-section">
                  <h3 className="image-studio-section-title">Zuletzt erstellt</h3>
                  <p className="image-studio-section-subtitle">Deine gespeicherten Sharepics</p>
                  <div className="image-studio-recent-grid image-studio-gallery-grid">
                    {recentGalleryItems.map((item) => {
                      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
                      const thumbnailUrl = item.thumbnailPath
                        ? `${baseURL}/share/${item.shareToken}/thumbnail`
                        : `${baseURL}/share/${item.shareToken}/preview`;
                      return (
                        <div
                          key={item.shareToken}
                          className="image-studio-recent-card image-studio-gallery-card"
                          onClick={() => handleGalleryItemEdit(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleGalleryItemEdit(item)}
                        >
                          <img src={thumbnailUrl} alt={item.title || 'Sharepic'} />
                          <span>{item.title || 'Sharepic'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {showRecentTypesSection && (
                <div className="image-studio-recent-section">
                  <h3 className="image-studio-section-title">Zuletzt verwendete Vorlagen</h3>
                  <p className="image-studio-section-subtitle">
                    Schnellzugriff auf deine Favoriten
                  </p>
                  <div className="image-studio-recent-grid">
                    {recentTypeConfigs.map((config) => (
                      <div
                        key={config.id}
                        className="image-studio-recent-card"
                        onClick={() => handleCategorySelect(config.category, null, config.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          handleCategorySelect(config.category, null, config.id)
                        }
                      >
                        {config.previewImage && (
                          <img src={config.previewImage} alt={config.label} />
                        )}
                        <span>{config.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ))}

        {/* Templates Section Header */}
        <div className="image-studio-recent-section image-studio-templates-section">
          <h3 className="image-studio-section-title">Oder starte mit einer Vorlage</h3>
          <p className="image-studio-section-subtitle">Wähle aus verschiedenen Formaten</p>
        </div>

        {/* Existing Category Cards */}
        <div className="type-options-grid type-options-grid--four">
          {startOptions.map((option) => (
            <div
              key={option.id}
              className={`type-card ${option.previewImage ? 'type-card--image gradient-dark' : ''} ${option.isComingSoon ? 'coming-soon' : ''}`}
              onClick={() => {
                if (option.isComingSoon) return;
                if (option.id === 'sharepics' && isAustrianUser) {
                  window.open('https://bildgenerator.gruene.at/', '_blank', 'noopener,noreferrer');
                  return;
                }
                if (option.isEarlyAccess) {
                  void navigate('/datenbank/vorlagen');
                  return;
                }
                handleCategorySelect(option.category, option.subcategory, option.directType);
              }}
              role="button"
              tabIndex={option.isComingSoon ? -1 : 0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key !== 'Enter' || option.isComingSoon) return;
                if (option.id === 'sharepics' && isAustrianUser) {
                  window.open('https://bildgenerator.gruene.at/', '_blank', 'noopener,noreferrer');
                  return;
                }
                if (option.isEarlyAccess) {
                  void navigate('/datenbank/vorlagen');
                  return;
                }
                handleCategorySelect(option.category, option.subcategory, option.directType);
              }}
            >
              {option.isComingSoon && <StatusBadge type="coming-soon" variant="card" />}
              {option.isEarlyAccess && <StatusBadge type="early-access" variant="card" />}
              {option.previewImage ? (
                <>
                  <img src={option.previewImage} alt={option.label} className="type-card__image" />
                  <h3>{option.label}</h3>
                  <p className="type-card__description">{option.description}</p>
                </>
              ) : (
                <>
                  <div className="type-icon">
                    <option.Icon />
                  </div>
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

export default ImageStudioCategorySelector;
