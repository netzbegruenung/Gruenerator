import {
  CardActionsMenu,
  cn,
  DropdownMenuItem,
  SectionHeader,
  Skeleton,
  VideoCard,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Share2, Trash2 } from 'lucide-react';
import React, { memo, useCallback, useState } from 'react';
import { FaImage, FaVideo } from 'react-icons/fa';
import { FiClock, FiFileText, FiImage, FiMonitor } from 'react-icons/fi';
import { PiKanban, PiPencilLine, PiStar, PiStarFill } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { useBoardsTyped } from '../../../hooks/useBoardsTyped';
import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { formatRelativeDate } from '../../../utils/dateFormatter';
import { getPublicAppOrigin, resolveApiAssetUrl } from '../../../utils/platform';
import { Lightbox } from '../../image-studio/components/Lightbox';

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text' | 'presentation';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  emoji?: string;
  boardType?: 'kanban' | 'whiteboard';
  thumbnailUrl?: string;
  duration?: number;
  creatorName?: string;
  accessType?: string;
  deleteEndpoint?: string;
  content?: string;
  documentType?: string;
}

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
  text: { label: 'Text', Icon: FiFileText },
  presentation: { label: 'Präsentation', Icon: FiMonitor },
};

const getTypeMeta = (
  item: RecentItem
): { label: string; Icon: React.ComponentType<{ className?: string }> } => {
  if (item.type === 'board' && item.boardType === 'whiteboard') {
    return { label: 'Whiteboard', Icon: PiPencilLine };
  }
  return TYPE_META[item.type];
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await apiClient.get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 12 },
  });
  return res.data?.items ?? [];
};

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  text: 'Ohne Titel',
  presentation: 'Neue Präsentation',
};

// Recover lightweight structure from document HTML for the preview: the first
// heading (h1–h6) becomes the title, the remaining text the body — mirroring the
// mobile DocPreview so both platforms show the same legible excerpt instead of a
// shrunken raw render. We have a real DOM here, so removing the heading node
// before reading textContent keeps the body from repeating the title.
const parseDocPreview = (html: string): { heading: string | null; body: string } => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const headingEl = tmp.querySelector('h1, h2, h3, h4, h5, h6');
  const heading = headingEl?.textContent?.trim() ?? '';
  headingEl?.remove();
  const body = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { heading: heading || null, body };
};

// Stylised placeholder for content-less cards (boards, empty docs): one
// eucalyptus "title" bar over greyed body bars — reads as a document outline
// instead of an empty icon plate. Widths are deliberately uneven so it looks
// like real prose.
const PlaceholderBars = memo(() => (
  <div className="flex flex-col gap-1.5 px-3 pt-3.5" aria-hidden>
    <div className="h-1.5 w-3/5 rounded-full bg-secondary-300 dark:bg-secondary-500" />
    <div className="h-1 w-[90%] rounded-full bg-grey-200 dark:bg-grey-300" />
    <div className="h-1 w-[85%] rounded-full bg-grey-200 dark:bg-grey-300" />
    <div className="h-1 w-[92%] rounded-full bg-grey-200 dark:bg-grey-300" />
    <div className="h-1 w-[68%] rounded-full bg-grey-200 dark:bg-grey-300" />
  </div>
));
PlaceholderBars.displayName = 'PlaceholderBars';

// A single Kanban "card": a rounded tile with one or two short prose bars, so a
// column reads as a stack of real tasks rather than empty boxes.
const MiniCard = memo(({ lines = 1 }: { lines?: number }) => (
  <div className="flex flex-col gap-1 rounded-[3px] border border-grey-200/70 bg-grey-50 px-1.5 py-1 dark:border-grey-600/50 dark:bg-grey-700/40">
    <div className="h-1 w-4/5 rounded-full bg-grey-300 dark:bg-grey-500" />
    {lines > 1 && <div className="h-1 w-1/2 rounded-full bg-grey-200 dark:bg-grey-600" />}
  </div>
));
MiniCard.displayName = 'MiniCard';

// Board overview for the preview sheet. The card list doesn't carry real board
// rows (those live in Yjs, loaded only via /boards/:id/state), so we render a
// type-faithful schematic instead of the generic doc outline: a three-column
// Kanban (eucalyptus-tinted column headers over stacked cards) or a grid of
// whiteboard sticky notes. Same paper sheet as a document — it reads as a
// snapshot of the board, not an empty plate.
const KANBAN_COLUMNS = [
  { tint: 'bg-secondary-400 dark:bg-secondary-500', cards: [2, 1] },
  { tint: 'bg-primary-400 dark:bg-primary-500', cards: [1, 1, 2] },
  { tint: 'bg-grey-300 dark:bg-grey-500', cards: [1] },
];

const WHITEBOARD_NOTES = [
  'bg-secondary-100 dark:bg-secondary-900/40',
  'bg-primary-100 dark:bg-primary-900/40',
  'bg-grey-100 dark:bg-grey-700/40',
  'bg-secondary-50 dark:bg-secondary-900/30',
  'bg-grey-100 dark:bg-grey-700/40',
  'bg-primary-50 dark:bg-primary-900/30',
];

const BoardPreviewBody = memo(({ boardType }: { boardType?: 'kanban' | 'whiteboard' }) => {
  if (boardType === 'whiteboard') {
    return (
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5 p-3" aria-hidden>
        {WHITEBOARD_NOTES.map((tint, i) => (
          <div
            key={i}
            className={cn(
              'flex flex-col justify-center gap-1 rounded-[3px] p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
              tint
            )}
          >
            <div className="h-1 w-4/5 rounded-full bg-black/10 dark:bg-white/15" />
            <div className="h-1 w-1/2 rounded-full bg-black/10 dark:bg-white/15" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-3 pt-3.5" aria-hidden>
      {KANBAN_COLUMNS.map((col, ci) => (
        <div key={ci} className="flex flex-1 flex-col gap-1.5">
          <div className={cn('h-1.5 w-3/4 rounded-full', col.tint)} />
          {col.cards.map((lines, i) => (
            <MiniCard key={i} lines={lines} />
          ))}
        </div>
      ))}
    </div>
  );
});
BoardPreviewBody.displayName = 'BoardPreviewBody';

// The "sheet": a white page anchored to the top of the preview zone that bleeds
// past the bottom edge (height taller than its clipped parent, top-only radius,
// no bottom border) so it always reads as a document. Stays pure white in dark
// mode — a paper sheet, like Google Docs — so its text uses an explicit dark
// colour rather than the theme foreground.
const PreviewSheet = memo(({ item }: { item: RecentItem }) => {
  let body: React.ReactNode;

  if (item.type === 'image' || item.type === 'video') {
    body = item.thumbnailUrl ? (
      <img
        src={resolveApiAssetUrl(item.thumbnailUrl)}
        alt={item.title || FALLBACK_TITLES[item.type]}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    ) : (
      <div className="flex h-full items-center justify-center text-3xl text-grey-300">
        {item.type === 'video' ? <FaVideo /> : <FaImage />}
      </div>
    );
  } else if ((item.type === 'doc' || item.type === 'text') && item.content?.trim()) {
    const { heading, body: excerpt } = parseDocPreview(item.content);
    body = (
      <div className="flex flex-col gap-1.5 px-3.5 pt-4 text-left">
        {heading && (
          <p className="m-0 line-clamp-2 text-[13px] font-bold leading-snug text-grey-800">
            {heading}
          </p>
        )}
        {excerpt && (
          <p className="m-0 line-clamp-6 text-[11px] leading-relaxed text-grey-500">{excerpt}</p>
        )}
      </div>
    );
  } else if (item.type === 'board') {
    body = <BoardPreviewBody boardType={item.boardType} />;
  } else {
    body = <PlaceholderBars />;
  }

  return (
    <div className="relative aspect-[5/4] overflow-hidden bg-grey-50 dark:bg-grey-800/40">
      <div className="absolute inset-x-0 top-3.5 mx-auto flex h-[130%] w-[78%] flex-col overflow-hidden rounded-t-[5px] border border-b-0 border-grey-200/80 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        {body}
      </div>
    </div>
  );
});
PreviewSheet.displayName = 'PreviewSheet';

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
    onConvertText,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
    onConvertText?: (textId: string) => void;
  }) => {
    const { label: typeLabel, Icon: TypeIcon } = getTypeMeta(item);
    const isShared = !!item.accessType && item.accessType !== 'owner';
    const durationLabel =
      item.type === 'video' && item.duration ? formatDuration(item.duration) : null;

    const cardClass = cn(
      'group relative flex flex-col overflow-hidden rounded-xl border border-grey-200/80 bg-background no-underline',
      'cursor-pointer transition-all duration-200 ease-out',
      'hover:-translate-y-0.5 hover:border-secondary-300 hover:shadow-md',
      'dark:border-grey-700/60 dark:hover:border-secondary-700'
    );

    const cardContent = (
      <>
        <div className="relative">
          <PreviewSheet item={item} />
          {durationLabel && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
              {durationLabel}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2 border-t border-grey-100 px-3 py-2.5 dark:border-grey-700/60">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 rounded-md bg-secondary-50 px-1.5 py-0.5 text-[11px] font-medium text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300">
              <TypeIcon className="size-3 shrink-0" />
              {typeLabel}
            </span>
            <h3 className="m-0 min-w-0 truncate text-sm font-medium text-foreground-heading">
              {item.title || FALLBACK_TITLES[item.type]}
            </h3>
            <p className="m-0 flex min-w-0 items-center gap-1 truncate text-xs text-grey-500 dark:text-grey-400">
              <FiClock className="size-3 shrink-0" />
              <span className="truncate">
                {formatRelativeDate(item.date)}
                {isShared && (item.creatorName ? ` · Von ${item.creatorName}` : ' · Geteilt')}
              </span>
            </p>
          </div>
          {/* Menu lives in the footer (not an overlay on the preview) so its hit
              target never overlaps the navigable card; CardActionsMenu stops
              propagation internally, so a click here never opens the document. */}
          <div className="-mr-1 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
            <CardActionsMenu onShare={() => onShare(item)} onDelete={() => onDelete(item)}>
              {item.type === 'board' && <FavouriteMenuItem id={item.id} />}
            </CardActionsMenu>
          </div>
        </div>
      </>
    );

    if (item.type === 'text' && onConvertText) {
      return (
        <div
          role="button"
          tabIndex={0}
          className={cardClass}
          onClick={() => onConvertText(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onConvertText(item.id);
            }
          }}
        >
          {cardContent}
        </div>
      );
    }

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

// Single horizontally-scrollable row at every breakpoint (≈5 visible on desktop,
// the rest peeking/scrollable) — mirrors the Notebooks row below it rather than
// collapsing to a wrapping grid.
const RECENT_ROW_CLASS = cn(
  // `overflow-x-auto` also clips vertically, so the cards' upward hover-lift +
  // shadow would be cut off — `pt-2` (matching `pb-2`) gives them room.
  'grid grid-flow-col gap-md overflow-x-auto pt-2 pb-2',
  'auto-cols-[75%] sm:auto-cols-[42%] md:auto-cols-[30%] lg:auto-cols-[19%]',
  '-mx-4 px-4 lg:mx-0 lg:px-0'
);

const RecentlyCreatedSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });

  const items = allItems.filter((item) => {
    if (item.type === 'text') return false;
    return true;
  });

  const { deleteBoard } = useBoardsTyped({ enabled: true });

  const handleConvertText = useCallback(
    async (textId: string) => {
      try {
        const res = await apiClient.post(`/auth/saved-texts/${textId}/convert-to-doc`);
        const { documentId } = res.data as { documentId: string };
        void navigate(`/docs/${documentId}`);
      } catch {
        // fallback to old editor
        void navigate(`/texte/texteditor?textId=${textId}`);
      }
    },
    [navigate]
  );

  const handleDelete = useCallback(
    (item: RecentItem) => {
      const messages: Record<RecentItemType, string> = {
        doc: 'Dokument wirklich löschen?',
        board: 'Board wirklich löschen?',
        image: 'Bild wirklich löschen?',
        video: 'Video wirklich löschen?',
        text: 'Text wirklich löschen?',
        presentation: 'Präsentation wirklich löschen?',
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

  return (
    <section className="mb-xl">
      <SectionHeader title="Zuletzt" />

      {isLoading ? (
        <div className={RECENT_ROW_CLASS}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="rounded-xl border border-grey-200/80 dark:border-grey-700/60 overflow-hidden"
            >
              <Skeleton className="aspect-[5/4] rounded-none" />
              <div className="px-3 py-2.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-3/4 mt-1.5" />
                <Skeleton className="h-3 w-1/2 mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Inhalte vorhanden.
        </p>
      ) : (
        <div className={RECENT_ROW_CLASS}>
          {items.map((item) =>
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
                onConvertText={handleConvertText}
              />
            )
          )}
        </div>
      )}
    </section>
  );
});

RecentlyCreatedSection.displayName = 'RecentlyCreatedSection';

export default RecentlyCreatedSection;
