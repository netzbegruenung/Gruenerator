import { AIPromptInput, CardGrid, SectionHeader } from '@gruenerator/ui';
import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useFeaturedVorlagen, type FeaturedVorlage } from '../hooks/useFeaturedVorlagen';
import { useRecentGalleryItems, type RecentGalleryItem } from '../hooks/useRecentGalleryItems';
import { getSharepicRoute } from '../utils/sharepicRoutes';
import { IMAGE_STUDIO_CATEGORIES } from '../utils/typeConfig';

const EXAMPLE_PROMPTS = [
  { label: 'Zitat', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
  { label: 'Sharepic', text: 'Sharepic mit 3 Zeilen über Windenergie' },
  { label: 'Info', text: 'Info-Grafik über erneuerbare Energien' },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const RECENT_GALLERY_OPTIONS = { limit: 5 } as const;

const PreviewCard = ({
  title,
  thumbnailUrl,
  fallbackEmoji,
  onClick,
}: {
  title: string;
  thumbnailUrl: string | null;
  fallbackEmoji?: string;
  onClick: () => void;
}) => (
  <div
    className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick()}
  >
    <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-square">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={title} loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="text-4xl select-none">{fallbackEmoji || '🖼'}</span>
      )}
    </div>
    <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
      <span className="text-sm font-medium text-foreground-heading truncate block">{title}</span>
    </div>
  </div>
);

function getTemplateThumbnailUrl(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl) return null;
  return thumbnailUrl.startsWith('http')
    ? thumbnailUrl
    : `${API_BASE_URL}/template-previews/${thumbnailUrl}`;
}

const ImageStudioCategorySelector: React.FC = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
  const setType = useImageStudioStore((state) => state.setType);
  const user = useAuthStore((s) => s.user);

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const firstName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const { items: recentGalleryItems, lastFetch: galleryLastFetch } =
    useRecentGalleryItems(RECENT_GALLERY_OPTIONS);
  const showGallerySection = galleryLastFetch !== null && recentGalleryItems.length > 0;

  const { data: featuredVorlagen = [] } = useFeaturedVorlagen(5);

  const isAustrianUser = user?.locale === 'de-AT';

  const handleCategorySelect = useCallback(
    (cat: string | null, subcat: string | null, directType?: string) => {
      if (directType) {
        void setType(directType);
        void navigate(`/studio/templates/${directType}`);
      } else if (cat === IMAGE_STUDIO_CATEGORIES.KI) {
        void setCategory(cat, subcat);
        void navigate('/imagine');
      } else if (cat) {
        void setCategory(cat, subcat);
        void navigate(`/studio/${cat}`);
      }
    },
    [setCategory, setType, navigate]
  );

  const handleGalleryItemEdit = useCallback(
    (item: RecentGalleryItem) => {
      const metadata = item.imageMetadata || {};
      const sharepicType = metadata.sharepicType;

      if (!sharepicType) return;

      const route = getSharepicRoute(sharepicType);
      if (!route) return;

      void navigate(route, {
        state: {
          galleryEditMode: true,
          shareToken: item.shareToken,
          content: { ...metadata.content, sharepicType },
          styling: metadata.styling || {},
          originalImageUrl: `${API_BASE_URL}/share/${item.shareToken}/original`,
          title: item.title,
        },
      });
    },
    [navigate]
  );

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

        if (result.isKiType) {
          void navigate(`/imagine/pure-create`);
          return;
        }

        loadFromAIGeneration(
          result.type,
          result.data as unknown as Record<string, string>,
          result.selectedImage
        );

        void navigate(`/studio/templates/${result.type}`);
      } catch (error: unknown) {
        setGenerationError(
          (error instanceof Error ? error.message : String(error)) || 'Ein Fehler ist aufgetreten'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [promptInput, isGenerating, loadFromAIGeneration, navigate]
  );

  return (
    <PageContainer maxWidth="lg">
      <div className="text-center mb-lg pt-md">
        <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
          {firstName ? `Hallo, ${firstName}!` : 'Studio'}
        </h1>
        <p className="text-lg text-grey-500 dark:text-grey-400">
          Erstelle Sharepics, KI-Bilder und Videos.
        </p>
      </div>

      {!isAustrianUser && (
        <div className="mb-xl">
          <AIPromptInput
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handlePromptSubmit}
            placeholder="Beschreibe dein Sharepic..."
            isLoading={isGenerating}
            error={generationError}
            examples={EXAMPLE_PROMPTS}
          />
        </div>
      )}

      <section className="mb-xl">
        <SectionHeader
          title="Sharepics"
          onCreate={() => {
            if (isAustrianUser) {
              window.open('https://bildgenerator.gruene.at/', '_blank', 'noopener,noreferrer');
            } else {
              handleCategorySelect(IMAGE_STUDIO_CATEGORIES.TEMPLATES, null);
            }
          }}
          createLabel="Neues Sharepic erstellen"
        />
        {showGallerySection && (
          <CardGrid columns="5">
            {recentGalleryItems.map((item) => (
              <PreviewCard
                key={item.shareToken}
                title={item.title || 'Sharepic'}
                thumbnailUrl={
                  item.thumbnailPath
                    ? `${API_BASE_URL}/share/${item.shareToken}/thumbnail`
                    : `${API_BASE_URL}/share/${item.shareToken}/preview?w=400`
                }
                onClick={() => handleGalleryItemEdit(item)}
              />
            ))}
          </CardGrid>
        )}
      </section>

      <section className="mb-xl">
        <SectionHeader
          title="Vorlagen"
          onCreate={() => navigate('/datenbank/vorlagen')}
          createLabel="Alle Vorlagen"
        />
        {featuredVorlagen.length > 0 && (
          <CardGrid columns="5">
            {featuredVorlagen.map((v) => (
              <PreviewCard
                key={v.id}
                title={v.title}
                thumbnailUrl={getTemplateThumbnailUrl(v.thumbnail_url)}
                onClick={() => {
                  if (v.external_url) {
                    window.open(v.external_url, '_blank', 'noopener,noreferrer');
                  } else {
                    navigate('/datenbank/vorlagen');
                  }
                }}
              />
            ))}
          </CardGrid>
        )}
      </section>

      <section className="mb-xl">
        <SectionHeader
          title="Imagine"
          onCreate={() => {
            setCategory(IMAGE_STUDIO_CATEGORIES.KI, null);
            navigate('/imagine');
          }}
          createLabel="Neues KI-Bild erstellen"
        />
      </section>

      <section className="mb-xl">
        <SectionHeader
          title="Reel"
          onCreate={() => navigate('/studio/video')}
          createLabel="Neues Reel erstellen"
        />
      </section>
    </PageContainer>
  );
};

export default ImageStudioCategorySelector;
