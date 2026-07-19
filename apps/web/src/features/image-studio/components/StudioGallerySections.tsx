import { isCanvasTemplateType, type CanvasListItem } from '@gruenerator/contracts';
import { useShareStore } from '@gruenerator/shared';
import { getContractsClient } from '@gruenerator/shared/api';
import { CardActionsMenu, CardGrid, DropdownMenuItem, SectionHeader } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Share2 } from 'lucide-react';
import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { SharedMediaImage } from '../../../components/common/SharedMediaImage';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { SHOW_SHAREPIC_STUDIO } from '../../../config/featureFlags';
import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { resolveApiAssetUrl, shareThumbnailPreviewUrl } from '../../../utils/platform';
import ReelsSection from '../../workplace/components/ReelsSection';
import { useRecentCanvases } from '../hooks/useRecentCanvases';
import { useRecentGalleryItems, type RecentGalleryItem } from '../hooks/useRecentGalleryItems';
import { getSharepicRoute } from '../utils/sharepicRoutes';
import { IMAGE_STUDIO_CATEGORIES, getTypeConfig, getTypeFromLegacy } from '../utils/typeConfig';

import { Lightbox } from './Lightbox';
import { buildStudioQuickStarts, QuickStartTiles } from './QuickStartTiles';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

const RECENT_GALLERY_OPTIONS = { limit: 20 } as const;

// The Sharepics grid merges two sources: published image shares (shared_media)
// and editable canvas documents. No dedup — an exported share and its canvas
// are two distinct artifacts with no linking key.
type SharepicCard =
  | { kind: 'share'; date: string; item: RecentGalleryItem }
  | { kind: 'canvas'; date: string; item: CanvasListItem };

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
  actions,
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
  /** Optional kebab menu (rename/delete), overlaid top-right, shown on hover. */
  actions?: ReactNode;
}) => (
  <div
    className="group relative flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick()}
  >
    {actions && (
      <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
        {actions}
      </div>
    )}
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

/** Studio gallery (Sharepics + Imagine + Reels) without page chrome — shared
 * by the /studio landing and the workplace "Arbeiten" tab. */
const StudioGallerySections = () => {
  const navigate = useNavigate();
  const setCategory = useImageStudioStore((state) => state.setCategory);
  const setType = useImageStudioStore((state) => state.setType);
  const user = useAuthStore((s) => s.user);

  // In prod the canvas editor is gated off, so gallery items open a read-only
  // preview (Lightbox) instead of the edit flow.
  const [previewItem, setPreviewItem] = useState<RecentGalleryItem | null>(null);
  const [shareItem, setShareItem] = useState<RecentGalleryItem | null>(null);

  const {
    items: recentGalleryItems,
    lastFetch: galleryLastFetch,
    refresh: refreshGallery,
  } = useRecentGalleryItems(RECENT_GALLERY_OPTIONS);

  const queryClient = useQueryClient();
  const deleteShare = useShareStore((s) => s.deleteShare);

  // Rename/delete for the two sharepic backends. Canvas docs support both via the
  // contracts client; published shares only support delete (no title-only endpoint).
  const handleRenameCanvas = useCallback(
    (item: CanvasListItem) => {
      const next = window.prompt('Neuer Titel:', item.title || 'Sharepic');
      if (next === null) return;
      const title = next.trim();
      if (!title || title === item.title) return;
      void getContractsClient()
        .canvas.update({ params: { id: item.id }, body: { title } })
        .then((result) => {
          if (result.status === 200) {
            void queryClient.invalidateQueries({ queryKey: ['canvas', 'list'] });
          } else {
            console.error('[StudioGallerySections] canvas rename failed', result.status);
          }
        })
        .catch((err: unknown) =>
          console.error('[StudioGallerySections] canvas rename failed', err)
        );
    },
    [queryClient]
  );

  const handleDeleteCanvas = useCallback(
    (item: CanvasListItem) => {
      if (!window.confirm('Sharepic wirklich löschen?')) return;
      void getContractsClient()
        .canvas.remove({ params: { id: item.id } })
        .then((result) => {
          if (result.status === 200) {
            void queryClient.invalidateQueries({ queryKey: ['canvas', 'list'] });
          } else {
            console.error('[StudioGallerySections] canvas delete failed', result.status);
          }
        })
        .catch((err: unknown) =>
          console.error('[StudioGallerySections] canvas delete failed', err)
        );
    },
    [queryClient]
  );

  const handleDeleteShare = useCallback(
    (item: RecentGalleryItem) => {
      if (!window.confirm('Sharepic wirklich löschen?')) return;
      void deleteShare(item.shareToken)
        .then(() => refreshGallery())
        .catch((err: unknown) => console.error('[StudioGallerySections] share delete failed', err));
    },
    [deleteShare, refreshGallery]
  );

  const isAustrianUser = user?.locale === 'de-AT';

  // Canvas cards lead to the flag-gated internal editor for both DE and AT
  // (AT gets the de-AT template set via audience filtering).
  const canvasesEnabled = SHOW_SHAREPIC_STUDIO;
  const canvasQuery = useRecentCanvases(canvasesEnabled);

  const { sharepicCards, imagineItems } = useMemo(() => {
    const sharepics: SharepicCard[] = [];
    const imagine: RecentGalleryItem[] = [];
    for (const item of recentGalleryItems) {
      if (isKiImage(item.imageType)) {
        imagine.push(item);
      } else {
        sharepics.push({ kind: 'share', date: item.createdAt, item });
      }
    }
    for (const canvas of canvasQuery.data ?? []) {
      sharepics.push({ kind: 'canvas', date: canvas.updated_at, item: canvas });
    }
    sharepics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { sharepicCards: sharepics.slice(0, 5), imagineItems: imagine.slice(0, 5) };
  }, [recentGalleryItems, canvasQuery.data]);

  // Sections paint as soon as the gallery resolves (incl. its localStorage
  // cache) — a slow canvas.list must not hold back already-loaded content.
  const hasFetched = galleryLastFetch !== null;
  const showSharepics = hasFetched && sharepicCards.length > 0;
  const showImagine = hasFetched && imagineItems.length > 0;
  // Once the gallery has loaded and both buckets are empty there's nothing to
  // preview, so we swap the bare section headers for engaging quick-start tiles.
  // Only this decision additionally waits for the canvas query, so a user
  // whose sole artifact is a canvas doesn't get misclassified as empty.
  const canvasesSettled = !canvasesEnabled || canvasQuery.isFetched;
  const isStudioEmpty =
    hasFetched && canvasesSettled && sharepicCards.length === 0 && imagineItems.length === 0;

  const handleCategorySelect = useCallback(
    (cat: string | null, subcat: string | null, directType?: string) => {
      if (directType) {
        void setType(directType);
        void navigate(`/studio/templates/${directType}`);
      } else if (cat === IMAGE_STUDIO_CATEGORIES.KI) {
        void setCategory(cat, subcat);
        void navigate('/bild-editor');
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

      // Shares without edit metadata (e.g. pre-canvas legacy rows) can't open
      // the edit flow — show the read-only preview instead of dead-clicking.
      const route = sharepicType ? getSharepicRoute(sharepicType) : null;
      if (!sharepicType || !route) {
        setPreviewItem(item);
        return;
      }

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
      console.warn('[StudioGallerySections] download failed', err);
    }
  }, []);

  // Quick-start tiles shown when the studio is empty. The builder centralises the
  // AT/SHOW_SHAREPIC_STUDIO handling; the DE handlers here mirror the section
  // create handlers below so behaviour stays consistent.
  const quickStarts = buildStudioQuickStarts({
    isAustrianUser,
    onSharepic: () => handleCategorySelect(IMAGE_STUDIO_CATEGORIES.TEMPLATES, null),
    onKiBild: () => {
      setCategory(IMAGE_STUDIO_CATEGORIES.KI, null);
      void navigate('/bild-editor');
    },
    onReel: () => void navigate('/studio/video'),
  });

  return (
    <>
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
            // Both DE and AT create through the internal canvas editor (AT gets
            // the de-AT template set), gated by SHOW_SHAREPIC_STUDIO.
            onCreate={
              SHOW_SHAREPIC_STUDIO
                ? () => handleCategorySelect(IMAGE_STUDIO_CATEGORIES.TEMPLATES, null)
                : undefined
            }
            createLabel="Neues Sharepic erstellen"
          />
          {showSharepics && (
            <CardGrid columns="5">
              {sharepicCards.map((card, i) =>
                card.kind === 'canvas' ? (
                  <PreviewCard
                    key={`canvas-${card.item.id}`}
                    title={card.item.title || 'Sharepic'}
                    thumbnailUrl={resolveApiAssetUrl(
                      shareThumbnailPreviewUrl(card.item.thumbnail_url ?? undefined)
                    )}
                    onClick={() => void navigate(`/studio/canvas/${card.item.id}`)}
                    actions={
                      <CardActionsMenu
                        onDelete={() => handleDeleteCanvas(card.item)}
                        className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
                      >
                        <DropdownMenuItem onClick={() => handleRenameCanvas(card.item)}>
                          <Pencil size={14} />
                          Umbenennen
                        </DropdownMenuItem>
                      </CardActionsMenu>
                    }
                  />
                ) : (
                  <PreviewCard
                    key={card.item.shareToken}
                    title={card.item.title || 'Sharepic'}
                    shareToken={card.item.shareToken}
                    blurhash={card.item.imageMetadata?.blurhash as string | undefined}
                    priority={i < 5}
                    // With the studio on, editing opens the canvas flow; otherwise
                    // (kill-switch off) it opens a read-only preview.
                    onClick={() =>
                      SHOW_SHAREPIC_STUDIO
                        ? handleGalleryItemEdit(card.item)
                        : setPreviewItem(card.item)
                    }
                    // Published shares support delete only (no title-only rename endpoint).
                    actions={
                      <CardActionsMenu
                        onDelete={() => handleDeleteShare(card.item)}
                        className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
                      />
                    }
                  />
                )
              )}
            </CardGrid>
          )}
        </section>
      )}

      {!isStudioEmpty && (
        <section className="mb-xl">
          <SectionHeader
            title="Imagine"
            onCreate={() => {
              setCategory(IMAGE_STUDIO_CATEGORIES.KI, null);
              void navigate('/bild-editor');
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
    </>
  );
};

export default StudioGallerySections;
