import {
  CardActionsMenu,
  CardGrid,
  cn,
  DropdownMenuItem,
  SectionHeader,
  Skeleton,
  VideoCard,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Share2, Trash2 } from 'lucide-react';
import React, { memo, useCallback, useState } from 'react';
import { FaVideo } from 'react-icons/fa';
import { FiClock, FiFileText, FiGrid, FiImage, FiMonitor } from 'react-icons/fi';
import { PiKanban, PiPencilLine, PiStar, PiStarFill } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import {
  BoardPreviewBody,
  PlaceholderBars,
  SlidesPreviewBody,
  TablePreviewBody,
} from '../../../components/common/SchematicPreviews';
import { SharedMediaImage } from '../../../components/common/SharedMediaImage';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { useBoardsTyped } from '../../../hooks/useBoardsTyped';
import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { formatRelativeDate } from '../../../utils/dateFormatter';
import { parseDocPreview } from '../../../utils/parseDocPreview';
import {
  getPublicAppOrigin,
  resolveApiAssetUrl,
  shareThumbnailPreviewUrl,
} from '../../../utils/platform';
import { Lightbox } from '../../image-studio/components/Lightbox';
import {
  type RecentItem,
  type RecentItemType,
  useRecentActivity,
} from '../hooks/useRecentActivity';

// Shared type vocabulary: every card surfaces the same eucalyptus-tinted badge
// (icon + label) so a board and a document read as one system. `boardType`
// disambiguates Kanban vs. Whiteboard at render time.
const TYPE_META: Record<
  RecentItemType,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  doc: { label: 'Dokument', Icon: FiFileText },
  board: { label: 'Board', Icon: PiKanban },
  image: { label: 'Bild', Icon: FiImage },
  video: { label: 'Video', Icon: FaVideo },
  canvas: { label: 'Sharepic', Icon: FiImage },
};

// Spreadsheet-style docs (legacy 'tabelle' HTML tables and Univer 'sheets')
// arrive as `type: 'doc'` but read as their own category: a grid badge + grid
// preview instead of the prose excerpt. Same for reveal 'presentations'.
const isTablePreview = (item: RecentItem): boolean =>
  item.type === 'doc' && (item.documentType === 'tabelle' || item.documentType === 'sheets');

const isSlidesPreview = (item: RecentItem): boolean =>
  item.type === 'doc' && item.documentType === 'presentations';

const getTypeMeta = (
  item: RecentItem
): { label: string; Icon: React.ComponentType<{ className?: string }> } => {
  if (item.type === 'board' && item.boardType === 'whiteboard') {
    return { label: 'Whiteboard', Icon: PiPencilLine };
  }
  if (isTablePreview(item)) {
    return { label: 'Tabelle', Icon: FiGrid };
  }
  if (isSlidesPreview(item)) {
    return { label: 'Präsentation', Icon: FiMonitor };
  }
  return TYPE_META[item.type];
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// The vertical grid shows this many items by default (a couple of rows, like
// Word's "Recent"); "Mehr anzeigen" reveals the rest of the fetched items.
const RECENT_COLLAPSE_THRESHOLD = 12;

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  canvas: 'Neuer Canvas',
};

// Faint, fixed-height plate every preview sits on (matches the workspace
// mockup): content lives directly on a tinted surface — no floating paper sheet.
const PREVIEW_PLATE = 'h-[172px] overflow-hidden bg-grey-50 dark:bg-grey-800/40';

// Schematic preview bodies (placeholder bars, board/table/slides plates) are
// shared with the Office overview — see components/common/SchematicPreviews.

// Flat preview surface: media fills the plate (object-cover), documents show
// their heading + excerpt directly on the tinted plate, boards a schematic, and
// content-less items the prose outline — no floating paper sheet.
const PreviewArea = memo(({ item }: { item: RecentItem }) => {
  if (item.type === 'image' || item.type === 'video' || item.type === 'canvas') {
    // Images are shared-media backed (item.id is the share token) → responsive
    // variants + BlurHash. Videos and canvases have no image variants, so they
    // keep the plain thumbnail img.
    if (item.type === 'image') {
      return (
        <div className={PREVIEW_PLATE}>
          <SharedMediaImage
            shareToken={item.id}
            alt={item.title || FALLBACK_TITLES[item.type]}
            blurhash={item.blurhash}
            sizes="(max-width: 768px) 50vw, 280px"
            className="h-full w-full object-cover"
          />
        </div>
      );
    }
    if (item.thumbnailUrl) {
      return (
        <div className={PREVIEW_PLATE}>
          <img
            src={resolveApiAssetUrl(shareThumbnailPreviewUrl(item.thumbnailUrl))}
            alt={item.title || FALLBACK_TITLES[item.type]}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      );
    }
    return (
      <div
        className="flex h-[172px] items-center justify-center"
        style={{
          background:
            'repeating-linear-gradient(135deg, var(--color-grey-100) 0 10px, var(--color-grey-200) 10px 20px)',
        }}
        aria-hidden
      >
        <span className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-grey-500 dark:bg-grey-900/70 dark:text-grey-300">
          Bild-Vorschau
        </span>
      </div>
    );
  }

  // Tables get an edge-to-edge grid (no plate padding) plus a bottom fade so the
  // clipped rows read as "more below", matching the workspace mockup.
  if (isTablePreview(item)) {
    return (
      <div className={cn(PREVIEW_PLATE, 'relative')}>
        <TablePreviewBody content={item.content} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-b from-transparent to-grey-50 dark:to-grey-800" />
      </div>
    );
  }

  let body: React.ReactNode;
  if (isSlidesPreview(item)) {
    body = <SlidesPreviewBody content={item.content} />;
  } else if (item.type === 'doc' && item.content?.trim()) {
    const { heading, body: excerpt } = parseDocPreview(item.content);
    body = (
      <>
        {heading && (
          <p className="m-0 mb-2 line-clamp-2 text-[13px] font-bold leading-snug text-foreground-heading">
            {heading}
          </p>
        )}
        {excerpt && (
          <p className="m-0 line-clamp-6 text-[11.5px] leading-relaxed text-grey-500 dark:text-grey-400">
            {excerpt}
          </p>
        )}
      </>
    );
  } else if (item.type === 'board') {
    body = <BoardPreviewBody boardType={item.boardType} preview={item.preview} />;
  } else {
    body = <PlaceholderBars />;
  }

  return <div className={cn(PREVIEW_PLATE, 'p-4 text-left')}>{body}</div>;
});
PreviewArea.displayName = 'PreviewArea';

const FavouriteMenuItem = memo(({ id }: { id: string }) => {
  const starred = useIsFavourite(id);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);
  return (
    <DropdownMenuItem onClick={() => toggleFavourite(id)}>
      {starred ? <PiStarFill className="text-primary-600" /> : <PiStar />}
      {starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
    </DropdownMenuItem>
  );
});
FavouriteMenuItem.displayName = 'FavouriteMenuItem';

const ImageOwnerCard = memo(
  ({
    item,
    cardClass,
    cardContent,
    onDelete,
  }: {
    item: RecentItem;
    cardClass: string;
    cardContent: React.ReactNode;
    onDelete: (item: RecentItem) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const previewUrl = resolveApiAssetUrl(`/api/share/${item.id}/preview`);

    const handleDownload = useCallback(async () => {
      try {
        const res = await apiClient.get<Blob>(`/share/${item.id}/download`, {
          responseType: 'blob',
        });
        const url = window.URL.createObjectURL(res.data as Blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(item.title || 'bild').replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.warn('[ImageOwnerCard] download failed', err);
      }
    }, [item.id, item.title]);

    const actionBtn =
      'inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white px-sm py-xs rounded-full hover:bg-white/10 transition-colors';

    return (
      <>
        <div
          role="button"
          tabIndex={0}
          className={cn(cardClass, 'text-left')}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {cardContent}
        </div>
        <Lightbox
          isOpen={open}
          onClose={() => setOpen(false)}
          imageSrc={previewUrl}
          altText={item.title}
          actions={
            <>
              <button type="button" onClick={handleDownload} className={actionBtn}>
                <Download className="size-4" /> Download
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShareOpen(true);
                }}
                className={actionBtn}
              >
                <Share2 className="size-4" /> Teilen
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete(item);
                }}
                className={cn(actionBtn, 'text-red-300 hover:text-red-200')}
              >
                <Trash2 className="size-4" /> Löschen
              </button>
            </>
          }
        />
        <ShareMediaModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          mediaType="image"
          existingShare={{
            shareToken: item.id,
            mediaType: 'image',
            title: item.title,
            status: 'ready',
            createdAt: item.date,
            thumbnailUrl: item.thumbnailUrl,
          }}
        />
      </>
    );
  }
);
ImageOwnerCard.displayName = 'ImageOwnerCard';

const RecentItemCard = memo(
  ({
    item,
    onDelete,
    onShare,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
  }) => {
    const { label: typeLabel, Icon: TypeIcon } = getTypeMeta(item);
    const fallbackTitle = isTablePreview(item) ? 'Unbenannte Tabelle' : FALLBACK_TITLES[item.type];
    const isShared = !!item.accessType && item.accessType !== 'owner';
    const durationLabel =
      item.type === 'video' && item.duration ? formatDuration(item.duration) : null;

    const cardClass = cn(
      'group relative flex flex-col overflow-hidden rounded-[14px] border border-grey-200/80 bg-background no-underline',
      'cursor-pointer transition-all duration-200 ease-out',
      'hover:-translate-y-0.5 hover:border-secondary-300 hover:shadow-md',
      'dark:border-grey-700/60 dark:hover:border-secondary-700'
    );

    const cardContent = (
      <>
        <div className="relative">
          <PreviewArea item={item} />
          {durationLabel && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
              {durationLabel}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2 border-t border-grey-100 px-4 pb-4 pt-3.5 dark:border-grey-700/60">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-grey-100 px-2 py-0.5 text-[11.5px] font-medium text-grey-600 dark:bg-grey-700/50 dark:text-grey-300">
              <TypeIcon className="size-3 shrink-0" />
              {typeLabel}
            </span>
            <h3 className="m-0 mb-1.5 mt-2.5 min-w-0 truncate text-[15px] font-semibold text-foreground-heading">
              {item.title || fallbackTitle}
            </h3>
            <p className="m-0 flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-grey-500 dark:text-grey-400">
              <FiClock className="size-3 shrink-0" />
              <span className="truncate">
                {formatRelativeDate(item.date)}
                {isShared && (item.creatorName ? ` · Von ${item.creatorName}` : ' · Geteilt')}
              </span>
            </p>
          </div>
          {/* Menu lives in the footer (not an overlay on the preview) so its hit
              target never overlaps the navigable card; CardActionsMenu stops
              propagation *and* preventDefaults internally, so a click here never
              follows the enclosing <Link>'s href. */}
          <div className="-mr-1 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
            <CardActionsMenu onShare={() => onShare(item)} onDelete={() => onDelete(item)}>
              {item.type === 'board' && <FavouriteMenuItem id={item.id} />}
            </CardActionsMenu>
          </div>
        </div>
      </>
    );

    if (item.type === 'image') {
      return (
        <ImageOwnerCard
          item={item}
          cardClass={cardClass}
          cardContent={cardContent}
          onDelete={onDelete}
        />
      );
    }

    return (
      <Link to={item.href} className={cardClass}>
        {cardContent}
      </Link>
    );
  }
);
RecentItemCard.displayName = 'RecentItemCard';

const RecentReelCard = memo(
  ({
    item,
    onDelete,
    onShare,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
  }) => {
    const navigate = useNavigate();
    const videoId = item.href.includes('project=') ? item.href.split('project=')[1] : item.id;

    return (
      <VideoCard
        src={resolveApiAssetUrl(`/api/subtitler/projects/${videoId}/video`)}
        poster={resolveApiAssetUrl(item.thumbnailUrl)}
        title={item.title || FALLBACK_TITLES.video}
        duration={item.duration}
        aspect="square"
        onTitleClick={() => navigate(item.href)}
        overlay={
          <div
            className="absolute top-1 right-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CardActionsMenu
              onShare={() => onShare(item)}
              onDelete={() => onDelete(item)}
              className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
            />
          </div>
        }
      />
    );
  }
);
RecentReelCard.displayName = 'RecentReelCard';

const RecentlyCreatedSection: React.FC = memo(() => {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, isError, refetch } = useRecentActivity();

  const [expanded, setExpanded] = useState(false);

  const { deleteBoard } = useBoardsTyped({ enabled: true });

  const handleDelete = useCallback(
    (item: RecentItem) => {
      const messages: Record<RecentItemType, string> = {
        doc: 'Dokument wirklich löschen?',
        board: 'Board wirklich löschen?',
        image: 'Bild wirklich löschen?',
        video: 'Video wirklich löschen?',
        canvas: 'Sharepic wirklich löschen?',
      };

      if (!window.confirm(messages[item.type])) return;

      // Both delete paths need an explicit `.catch()` — a bare `.then()`
      // escapes rejections to `window.onunhandledrejection`, which Sentry
      // captures as an unhandled error (the earlier DELETE 401 incident
      // on stale recent-activity entries). On 401/403/404 we invalidate
      // the list so the ghost entry disappears from the UI.
      const onDeleteError = (err: unknown, endpoint: string) => {
        const status =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        console.warn('[RecentlyCreatedSection] delete failed', {
          endpoint,
          status,
          itemType: item.type,
          itemId: item.id,
        });
        if (status === 401 || status === 403 || status === 404) {
          void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
        }
      };

      if (item.type === 'board') {
        void deleteBoard
          .mutateAsync(item.id)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          })
          .catch((err: unknown) => onDeleteError(err, `board:${String(item.id)}`));
        return;
      }

      if (item.deleteEndpoint) {
        const endpoint = item.deleteEndpoint.replace(/^\/api/, '');
        void apiClient
          .delete(endpoint)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          })
          .catch((err: unknown) => onDeleteError(err, endpoint));
      }
    },
    [deleteBoard, queryClient]
  );

  const handleShare = useCallback((item: RecentItem) => {
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}${item.href}`);
  }, []);

  // Shared between the collapsed row and the expanded grid so both layouts stay
  // in sync — videos use the reel card, everything else the generic card.
  const renderCard = (item: RecentItem) =>
    item.type === 'video' ? (
      <RecentReelCard
        key={`${item.type}-${item.id}`}
        item={item}
        onDelete={handleDelete}
        onShare={handleShare}
      />
    ) : (
      <RecentItemCard
        key={`${item.type}-${item.id}`}
        item={item}
        onDelete={handleDelete}
        onShare={handleShare}
      />
    );

  return (
    <section className="mb-xl">
      <SectionHeader title="Zuletzt" />

      {isLoading ? (
        <CardGrid columns="5" gap="md">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-grey-200/80 dark:border-grey-700/60 overflow-hidden"
            >
              <Skeleton className="h-[172px] rounded-none" />
              <div className="px-4 py-3.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-3/4 mt-1.5" />
                <Skeleton className="h-3 w-1/2 mt-1.5" />
              </div>
            </div>
          ))}
        </CardGrid>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-lg text-center">
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Zuletzt bearbeitete Inhalte konnten nicht geladen werden.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Inhalte vorhanden.
        </p>
      ) : (
        <>
          {/* Vertical grid that scrolls with the page (like Word's "Recent"),
              sliced to the threshold; "Mehr anzeigen" reveals the rest. */}
          <CardGrid columns="5" gap="md">
            {(expanded ? items : items.slice(0, RECENT_COLLAPSE_THRESHOLD)).map(renderCard)}
          </CardGrid>
          {items.length > RECENT_COLLAPSE_THRESHOLD && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
            >
              {expanded
                ? 'Weniger anzeigen'
                : `+${items.length - RECENT_COLLAPSE_THRESHOLD} weitere anzeigen`}
            </button>
          )}
        </>
      )}
    </section>
  );
});

RecentlyCreatedSection.displayName = 'RecentlyCreatedSection';

export default RecentlyCreatedSection;
