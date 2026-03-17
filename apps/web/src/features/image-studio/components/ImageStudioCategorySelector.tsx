import { AIPromptInput, Button } from '@gruenerator/ui';
import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { HiSparkles } from 'react-icons/hi';
import { PiFolder, PiLayout, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useRecentValues } from '../../../hooks/useRecentValues';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useRecentGalleryItems, type RecentGalleryItem } from '../hooks/useRecentGalleryItems';
import { type StartOption } from '../types/componentTypes';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, getTypeConfig } from '../utils/typeConfig';

import PreviewImage from './PreviewImage';
import TypeCard from './TypeCard';

import type { TypeConfig } from '../utils/typeConfig/types';

const EXAMPLE_PROMPTS = [
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
      } else if (cat === IMAGE_STUDIO_CATEGORIES.KI) {
        void setCategory(cat, subcat);
        void navigate('/imagine');
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
          void navigate(`/imagine/pure-create`);
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
        previewImage: '/imagine/previews/dreizeilen-preview.webp',
        previewImageFallback: '/imagine/previews/dreizeilen-preview.png',
      },
      {
        id: 'imagine',
        category: IMAGE_STUDIO_CATEGORIES.KI,
        subcategory: null,
        label: 'Imagine (KI)',
        description: 'Erstelle oder bearbeite Bilder mit KI',
        Icon: HiSparkles,
        previewImage: '/imagine/variants-pure/soft-illustration.webp',
        previewImageFallback: '/imagine/variants-pure/soft-illustration.png',
      },
      {
        id: 'vorlagen',
        category: null,
        subcategory: null,
        label: 'Vorlagen',
        description: 'Durchsuche vorgefertigte Vorlagen',
        Icon: PiFolder,
        previewImage: '/imagine/previews/vorlagen-preview.webp',
        previewImageFallback: '/imagine/previews/vorlagen-preview.jpg',
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
        directType: IMAGE_STUDIO_TYPES.PROFILBILD,
        isComingSoon: true,
      },
    ],
    [isAustrianUser]
  );

  return (
    <div className="w-full flex justify-center p-8 max-[768px]:p-4">
      <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
        <div className="flex justify-center items-center gap-md mb-xl pt-lg text-center max-[768px]:flex-col max-[768px]:gap-sm max-[768px]:mb-lg">
          <h1 className="m-0 text-3xl font-extrabold tracking-tight text-center max-[768px]:text-2xl">
            {firstName ? `Hallo, ${firstName}!` : 'Willkommen im Image-Studio'}
          </h1>
          <Button
            variant="brand-outline"
            size="brand"
            onClick={() => navigate('/image-studio/gallery')}
            className="flex items-center gap-sm max-[768px]:w-full max-[768px]:justify-center"
          >
            <PiFolder /> Meine Bilder
          </Button>
        </div>

        <EarlyAccessBanner />

        {/* AI Prompt Input Section - Hidden for Austrian users */}
        {!isAustrianUser && (
          <AIPromptInput
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handlePromptSubmit}
            placeholder="Beschreibe dein Sharepic..."
            isLoading={isGenerating}
            error={generationError}
            examples={EXAMPLE_PROMPTS}
          />
        )}

        {/* Recent Sections - Side by side when both exist */}
        {(showGallerySection || showRecentTypesSection) &&
          (showGallerySection && showRecentTypesSection ? (
            <div className="grid grid-cols-2 gap-xl mb-xl max-[1023px]:gap-lg max-[768px]:grid-cols-1 max-[768px]:gap-lg">
              {/* Recent Gallery Items */}
              <div className="text-left">
                <h3 className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-sm font-semibold text-[var(--font-color-secondary)] uppercase tracking-wider mb-xs">
                  Zuletzt erstellt
                </h3>
                <p className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-xs text-[var(--font-color-secondary)] mb-md opacity-80">
                  Deine gespeicherten Sharepics
                </p>
                <div className="flex gap-md overflow-x-auto pb-sm scrollbar-none">
                  {recentGalleryItems.map((item) => {
                    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
                    const thumbnailUrl = item.thumbnailPath
                      ? `${baseURL}/share/${item.shareToken}/thumbnail`
                      : `${baseURL}/share/${item.shareToken}/preview?w=400`;
                    return (
                      <div
                        key={item.shareToken}
                        className="shrink-0 w-[140px] flex flex-col items-center gap-sm p-sm bg-background border border-[var(--border-color)] rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md max-[768px]:w-[110px]"
                        onClick={() => handleGalleryItemEdit(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleGalleryItemEdit(item)}
                      >
                        <img
                          src={thumbnailUrl}
                          alt={item.title || 'Sharepic'}
                          loading="lazy"
                          className="w-[120px] h-[120px] object-cover rounded-md bg-background-alt max-[768px]:w-[90px] max-[768px]:h-[90px]"
                        />
                        <span className="text-xs font-medium text-foreground text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] max-[768px]:max-w-[90px]">
                          {item.title || 'Sharepic'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Template Types */}
              <div className="text-left">
                <h3 className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-sm font-semibold text-[var(--font-color-secondary)] uppercase tracking-wider mb-xs">
                  Zuletzt verwendete Vorlagen
                </h3>
                <p className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-xs text-[var(--font-color-secondary)] mb-md opacity-80">
                  Schnellzugriff auf deine Favoriten
                </p>
                <div className="flex gap-md overflow-x-auto pb-sm scrollbar-none">
                  {recentTypeConfigs.map((config) => (
                    <div
                      key={config.id}
                      className="shrink-0 w-[120px] flex flex-col items-center gap-sm p-sm bg-background-alt rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md max-[768px]:w-[100px]"
                      onClick={() => handleCategorySelect(config.category, null, config.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && handleCategorySelect(config.category, null, config.id)
                      }
                    >
                      {config.previewImage && (
                        <PreviewImage
                          src={config.previewImage}
                          fallbackSrc={config.previewImageFallback}
                          alt={config.label}
                        />
                      )}
                      <span className="text-xs font-medium text-foreground text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                        {config.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {showGallerySection && (
                <div className="mb-xl text-left">
                  <h3 className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-sm font-semibold text-[var(--font-color-secondary)] uppercase tracking-wider mb-xs">
                    Zuletzt erstellt
                  </h3>
                  <p className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-xs text-[var(--font-color-secondary)] mb-md opacity-80">
                    Deine gespeicherten Sharepics
                  </p>
                  <div className="flex gap-md overflow-x-auto pb-sm scrollbar-none">
                    {recentGalleryItems.map((item) => {
                      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
                      const thumbnailUrl = item.thumbnailPath
                        ? `${baseURL}/share/${item.shareToken}/thumbnail`
                        : `${baseURL}/share/${item.shareToken}/preview?w=400`;
                      return (
                        <div
                          key={item.shareToken}
                          className="shrink-0 w-[140px] flex flex-col items-center gap-sm p-sm bg-background border border-[var(--border-color)] rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md max-[768px]:w-[110px]"
                          onClick={() => handleGalleryItemEdit(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleGalleryItemEdit(item)}
                        >
                          <img
                            src={thumbnailUrl}
                            alt={item.title || 'Sharepic'}
                            loading="lazy"
                            className="w-[120px] h-[120px] object-cover rounded-md bg-background-alt max-[768px]:w-[90px] max-[768px]:h-[90px]"
                          />
                          <span className="text-xs font-medium text-foreground text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                            {item.title || 'Sharepic'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {showRecentTypesSection && (
                <div className="mb-xl text-left">
                  <h3 className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-sm font-semibold text-[var(--font-color-secondary)] uppercase tracking-wider mb-xs">
                    Zuletzt verwendete Vorlagen
                  </h3>
                  <p className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-xs text-[var(--font-color-secondary)] mb-md opacity-80">
                    Schnellzugriff auf deine Favoriten
                  </p>
                  <div className="flex gap-md overflow-x-auto pb-sm scrollbar-none">
                    {recentTypeConfigs.map((config) => (
                      <div
                        key={config.id}
                        className="shrink-0 w-[120px] flex flex-col items-center gap-sm p-sm bg-background-alt rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md max-[768px]:w-[100px]"
                        onClick={() => handleCategorySelect(config.category, null, config.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          handleCategorySelect(config.category, null, config.id)
                        }
                      >
                        {config.previewImage && (
                          <PreviewImage
                            src={config.previewImage}
                            fallbackSrc={config.previewImageFallback}
                            alt={config.label}
                          />
                        )}
                        <span className="text-xs font-medium text-foreground text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                          {config.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ))}

        {/* Templates Section Header */}
        <div className="mt-xl text-left">
          <h3 className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-sm font-semibold text-[var(--font-color-secondary)] uppercase tracking-wider mb-xs">
            Oder starte mit einer Vorlage
          </h3>
          <p className="font-[Raleway,'PT_Sans',Arial,sans-serif] text-xs text-[var(--font-color-secondary)] mb-md opacity-80">
            Wähle aus verschiedenen Formaten
          </p>
        </div>

        {/* Category Cards */}
        <div className="flex gap-6 w-full max-[1024px]:flex-wrap max-[768px]:grid max-[768px]:grid-cols-2 max-[768px]:gap-4 max-[480px]:grid-cols-1">
          {startOptions.map((option) => {
            const handleClick = () => {
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
            };

            return option.previewImage ? (
              <TypeCard
                key={option.id}
                onClick={handleClick}
                previewImage={option.previewImage}
                previewImageFallback={option.previewImageFallback}
                label={option.label}
                description={option.description}
                isComingSoon={option.isComingSoon}
                variant="gradient-dark"
                className="flex-1 aspect-[3/4] max-[1024px]:basis-[calc(50%-0.75rem)] max-[768px]:aspect-square max-[600px]:basis-full"
                badge={
                  <>
                    {option.isComingSoon && <StatusBadge type="coming-soon" variant="card" />}
                    {option.isEarlyAccess && <StatusBadge type="early-access" variant="card" />}
                  </>
                }
              />
            ) : (
              <TypeCard
                key={option.id}
                onClick={handleClick}
                label={option.label}
                description={option.description}
                isComingSoon={option.isComingSoon}
                badge={
                  <>
                    {option.isComingSoon && <StatusBadge type="coming-soon" variant="card" />}
                    {option.isEarlyAccess && <StatusBadge type="early-access" variant="card" />}
                  </>
                }
              >
                <div className="text-5xl mb-4">
                  <option.Icon />
                </div>
                <h3 className="text-xl mb-4 text-[var(--font-color-h3)] text-center">
                  {option.label}
                </h3>
                <p className="text-base leading-normal mb-6 text-foreground">
                  {option.description}
                </p>
              </TypeCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImageStudioCategorySelector;
