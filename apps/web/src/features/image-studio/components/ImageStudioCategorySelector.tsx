import { isCanvasTemplateType } from '@gruenerator/contracts';
import { AIPromptInput, CardGrid, SectionHeader } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';
import { Download, Share2 } from 'lucide-react';
import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { SharedMediaImage } from '../../../components/common/SharedMediaImage';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { SHOW_SHAREPIC_STUDIO } from '../../../config/featureFlags';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import ReelsSection from '../../workplace/components/ReelsSection';
// import { useFeaturedVorlagen, type FeaturedVorlage } from '../hooks/useFeaturedVorlagen';
import { useRecentGalleryItems, type RecentGalleryItem } from '../hooks/useRecentGalleryItems';
import { SharepicResearchPreviewBanner } from '../researchPreviewWarning';
import { getSharepicRoute } from '../utils/sharepicRoutes';
import { IMAGE_STUDIO_CATEGORIES, getTypeConfig, getTypeFromLegacy } from '../utils/typeConfig';

import { Lightbox } from './Lightbox';
import { buildStudioQuickStarts, QuickStartTiles } from './QuickStartTiles';

const EXAMPLE_PROMPTS = [
  { label: 'Zitat', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
  { label: 'Sharepic', text: 'Sharepic mit 3 Zeilen über Windenergie' },
  { label: 'Info', text: 'Info-Grafik über erneuerbare Energien' },
];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

const RECENT_GALLERY_OPTIONS = { limit: 20 } as const;

// Legacy `image_type` values written by the Bilder tab before it emitted
// canonical KI ids (`pure-create`/`universal-edit`/`green-edit`). Existing rows
// still carry these, so the classifier maps them to KI without a backfill.
const KI_LEGACY_ALIASES = new Set(['imagine', 'edit']);

/**
 * Classifies a stored `image_type` value as a KI ("Imagine") image.
 * KI type ids (e.g. `pure-create`) resolve directly; template legacy types
 * (e.g. `Dreizeilen`) resolve via `getTypeFromLegacy`. Unknown/empty defaults to false
 * so legacy images fall back into the Sharepics bucket.
 */
const isKiImage = (imageType?: string): boolean => {
  if (!imageType) return false;
  if (KI_LEGACY_ALIASES.has(imageType)) return true;
  const direct = getTypeConfig(imageType);
  const legacyId = direct ? null : getTypeFromLegacy(imageType);
  const config = direct ?? (legacyId ? getTypeConfig(legacyId) : null);
  return config?.category === IMAGE_STUDIO_CATEGORIES.KI;
};

const PreviewCard = ({
  title,
  thumbnailUrl,
  shareToken,
  blurhash,
  priority,
  fallbackEmoji,
  onClick,
}: {
  title: string;
  /** External/non-shared-media thumbnail URL (e.g. template previews). */
  thumbnailUrl?: string | null;
  /** Shared-media share token → responsive variants + BlurHash (preferred). */
  shareToken?: string;
  blurhash?: string;
  priority?: boolean;
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
      {shareToken ? (
        <SharedMediaImage
          shareToken={shareToken}
          alt={title}
          blurhash={blurhash}
          priority={priority}
          sizes="(max-width: 768px) 33vw, 200px"
          className="w-full h-full object-cover"
        />
      ) : thumbnailUrl ? (
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

// function getTemplateThumbnailUrl(thumbnailUrl: string | null): string | null {
//   if (!thumbnailUrl) return null;
//   return thumbnailUrl.startsWith('http')
//     ? thumbnailUrl
//     : `${API_BASE_URL}/template-previews/${thumbnailUrl}`;
// }

const ImageStudioCategorySelector: React.FC = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
  const setType = useImageStudioStore((state) => state.setType);
  const user = useAuthStore((s) => s.user);

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  // In prod the canvas editor is gated off, so gallery items open a read-only
  // preview (Lightbox) instead of the edit flow.
  const [previewItem, setPreviewItem] = useState<RecentGalleryItem | null>(null);
  const [shareItem, setShareItem] = useState<RecentGalleryItem | null>(null);

  const firstName = useMemo(() => {
    const displayName = user?.display_name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const { items: recentGalleryItems, lastFetch: galleryLastFetch } =
    useRecentGalleryItems(RECENT_GALLERY_OPTIONS);

  const { sharepicItems, imagineItems } = useMemo(() => {
    const sharepics: RecentGalleryItem[] = [];
    const imagine: RecentGalleryItem[] = [];
    for (const item of recentGalleryItems) {
      (isKiImage(item.imageType) ? imagine : sharepics).push(item);
    }
    return { sharepicItems: sharepics.slice(0, 5), imagineItems: imagine.slice(0, 5) };
  }, [recentGalleryItems]);

  const hasFetched = galleryLastFetch !== null;
  const showSharepics = hasFetched && sharepicItems.length > 0;
  const showImagine = hasFetched && imagineItems.length > 0;
  // Once the gallery has loaded and both buckets are empty there's nothing to
  // preview, so we swap the bare section headers for engaging quick-start tiles.
  const isStudioEmpty = hasFetched && sharepicItems.length === 0 && imagineItems.length === 0;

  // const { data: featuredVorlagen = [] } = useFeaturedVorlagen(5);

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

  // Read-only download of a gallery item — mirrors the ImageOwnerCard flow in
  // RecentlyCreatedSection (blob fetch → object URL → anchor click).
  const handlePreviewDownload = useCallback(async (item: RecentGalleryItem) => {
    try {
      const res = await apiClient.get<Blob>(`/share/${item.shareToken}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(item.title || 'sharepic').replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[ImageStudioCategorySelector] download failed', err);
    }
  }, []);

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

        // Boundary guard: SharepicType statically includes KI ids and the API
        // response is cast — validate against the canonical canvas enum before
        // it can reach the studio store / mint.
        if (!isCanvasTemplateType(result.type)) {
          console.warn('[ImageStudioCategorySelector] non-canonical sharepic type:', result.type);
          setGenerationError('Unbekannter Vorlagentyp — bitte erneut versuchen.');
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

  // Quick-start tiles shown when the studio is empty. The builder centralises the
  // AT/SHOW_SHAREPIC_STUDIO handling; the DE handlers here mirror the section
  // create handlers below so behaviour stays consistent.
  const quickStarts = buildStudioQuickStarts({
    isAustrianUser,
    onSharepic: () => handleCategorySelect(IMAGE_STUDIO_CATEGORIES.TEMPLATES, null),
    onKiBild: () => {
      setCategory(IMAGE_STUDIO_CATEGORIES.KI, null);
      void navigate('/imagine');
    },
    onReel: () => void navigate('/studio/video'),
  });

  return (
    <PageContainer maxWidth="lg">
      {/* AT users are routed to the external bildgenerator and never reach the
          canvas creator, so the research-preview notice doesn't apply to them. */}
      {SHOW_SHAREPIC_STUDIO && !isAustrianUser && (
        <SharepicResearchPreviewBanner className="mb-lg" />
      )}
      <div className="text-center mb-lg pt-md">
        <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
          {firstName ? `Hallo, ${firstName}!` : 'Studio'}
        </h1>
        <p className="text-lg text-grey-500 dark:text-grey-400">
          Erstelle Sharepics, KI-Bilder und Videos.
        </p>
      </div>

      {SHOW_SHAREPIC_STUDIO && !isAustrianUser && (
        <div className="mb-xl">
          <AIPromptInput
            useDictation={useVoxtralDictation}
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

      {/* Empty studio: swap the bare section headers for quick-start tiles that
          route straight into each creation flow. */}
      {isStudioEmpty && (
        <div className="mx-auto max-w-[760px] pb-2xl pt-md">
          <QuickStartTiles items={quickStarts} />
        </div>
      )}

      {/* Hidden entirely when there's nothing to show: no create entry (sharepic
          studio off for DE, AT keeps the external link) and no gallery. */}
      {!isStudioEmpty && (SHOW_SHAREPIC_STUDIO || isAustrianUser || showSharepics) && (
        <section className="mb-xl">
          <SectionHeader
            title="Sharepics"
            // The title doubles as the entry point to the full Mediathek.
            onTitleClick={() => navigate('/media-library')}
            // AT keeps its external bildgenerator link; DE creation goes through
            // the canvas editor, a research preview gated by SHOW_SHAREPIC_STUDIO.
            onCreate={
              isAustrianUser
                ? () =>
                    window.open('https://bildgenerator.gruene.at/', '_blank', 'noopener,noreferrer')
                : SHOW_SHAREPIC_STUDIO
                  ? () => handleCategorySelect(IMAGE_STUDIO_CATEGORIES.TEMPLATES, null)
                  : undefined
            }
            createLabel="Neues Sharepic erstellen"
          />
          {showSharepics && (
            <CardGrid columns="5">
              {sharepicItems.map((item, i) => (
                <PreviewCard
                  key={item.shareToken}
                  title={item.title || 'Sharepic'}
                  shareToken={item.shareToken}
                  blurhash={item.imageMetadata?.blurhash as string | undefined}
                  priority={i < 5}
                  // With the studio on, editing opens the canvas flow; otherwise
                  // (kill-switch off) it opens a read-only preview.
                  onClick={() =>
                    SHOW_SHAREPIC_STUDIO ? handleGalleryItemEdit(item) : setPreviewItem(item)
                  }
                />
              ))}
            </CardGrid>
          )}
        </section>
      )}

      {/*
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
                    void navigate('/datenbank/vorlagen');
                  }
                }}
              />
            ))}
          </CardGrid>
        )}
      </section>
      */}

      {!isStudioEmpty && (
        <>
          <section className="mb-xl">
            <SectionHeader
              title="Imagine"
              onCreate={() => {
                setCategory(IMAGE_STUDIO_CATEGORIES.KI, null);
                void navigate('/imagine');
              }}
              createLabel="Neues KI-Bild erstellen"
            />
            {showImagine && (
              <CardGrid columns="5">
                {imagineItems.map((item) => (
                  <PreviewCard
                    key={item.shareToken}
                    title={item.title || 'KI-Bild'}
                    thumbnailUrl={
                      item.thumbnailPath
                        ? `${API_BASE_URL}/share/${item.shareToken}/thumbnail`
                        : `${API_BASE_URL}/share/${item.shareToken}/preview?w=400`
                    }
                    // KI images have no canvas editor; always open the read-only preview.
                    onClick={() => setPreviewItem(item)}
                  />
                ))}
              </CardGrid>
            )}
          </section>
        </>
      )}

      {/* Reels live in subtitler_projects (served by /recent-activity), a separate
          feed from the /share/recent images above — so the widget fetches its own
          data and self-hides when the user has no reels. Rendered outside the
          isStudioEmpty gate (that flag only reflects the image buckets) so a
          reel-only user still sees them. */}
      <ReelsSection />

      {/* Read-only preview for gallery items when the canvas editor is gated off. */}
      <Lightbox
        isOpen={previewItem !== null}
        onClose={() => setPreviewItem(null)}
        imageSrc={previewItem ? `${API_BASE_URL}/share/${previewItem.shareToken}/preview` : ''}
        altText={previewItem?.title || 'Sharepic'}
        actions={
          previewItem ? (
            <>
              <button
                type="button"
                onClick={() => void handlePreviewDownload(previewItem)}
                className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white px-sm py-xs rounded-full hover:bg-white/10 transition-colors"
              >
                <Download className="size-4" /> Download
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareItem(previewItem);
                  setPreviewItem(null);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white px-sm py-xs rounded-full hover:bg-white/10 transition-colors"
              >
                <Share2 className="size-4" /> Teilen
              </button>
            </>
          ) : null
        }
      />
      {shareItem && (
        <ShareMediaModal
          isOpen
          onClose={() => setShareItem(null)}
          mediaType="image"
          existingShare={{
            shareToken: shareItem.shareToken,
            mediaType: 'image',
            title: shareItem.title,
            status: 'ready',
            createdAt: shareItem.createdAt,
            thumbnailUrl: shareItem.thumbnailPath,
          }}
        />
      )}
    </PageContainer>
  );
};

export default ImageStudioCategorySelector;
