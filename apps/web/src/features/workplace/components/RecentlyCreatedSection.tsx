import {
  CardActionsMenu,
  CardGrid,
  cn,
  DropdownMenuItem,
  SectionHeader,
  Skeleton,
  VideoCard,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Share2, Trash2 } from 'lucide-react';
import React, { memo, useCallback, useState } from 'react';
import { FaVideo } from 'react-icons/fa';
import { FiClock, FiFileText, FiGrid, FiImage } from 'react-icons/fi';
import { PiKanban, PiPencilLine, PiStar, PiStarFill } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import { SharedMediaImage } from '../../../components/common/SharedMediaImage';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import apiClient from '../../../components/utils/apiClient';
import { useBoardsTyped } from '../../../hooks/useBoardsTyped';
import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { formatRelativeDate } from '../../../utils/dateFormatter';
import { parseDocPreview } from '../../../utils/parseDocPreview';
import { parseTablePreview } from '../../../utils/parseTablePreview';
import { getPublicAppOrigin, resolveApiAssetUrl } from '../../../utils/platform';
import { Lightbox } from '../../image-studio/components/Lightbox';

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text' | 'canvas';

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
  canvas: { label: 'Sharepic', Icon: FiImage },
};

// Spreadsheet-style docs (subtype 'tabelle') arrive as `type: 'doc'` but read as
// their own category: a grid badge + grid preview instead of the prose excerpt.
const isTablePreview = (item: RecentItem): boolean =>
  item.type === 'doc' && item.documentType === 'tabelle';

const getTypeMeta = (
  item: RecentItem
): { label: string; Icon: React.ComponentType<{ className?: string }> } => {
  if (item.type === 'board' && item.boardType === 'whiteboard') {
    return { label: 'Whiteboard', Icon: PiPencilLine };
  }
  if (isTablePreview(item)) {
    return { label: 'Tabelle', Icon: FiGrid };
  }
  return TYPE_META[item.type];
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// Fetch the backend maximum (capped at 30 server-side) so the "Mehr anzeigen"
// expansion has more than the collapsed row to reveal without a refetch.
const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await apiClient.get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 30 },
  });
  return res.data?.items ?? [];
};

// Collapsed, the section shows a horizontally-scrollable row sliced to this
// count; "Mehr anzeigen" expands the rest into a wrapping grid (mirrors the
// TextsSection expand pattern).
const RECENT_COLLAPSE_THRESHOLD = 10;

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  text: 'Ohne Titel',
  canvas: 'Neuer Canvas',
};

// Faint, fixed-height plate every preview sits on (matches the workspace
// mockup): content lives directly on a tinted surface — no floating paper sheet.
const PREVIEW_PLATE = 'h-[172px] overflow-hidden bg-grey-50 dark:bg-grey-800/40';

// Stylised placeholder for content-less documents: one eucalyptus "title" bar
// over greyed body bars — reads as a document outline instead of an empty plate.
// Widths are deliberately uneven so it looks like real prose.
const PlaceholderBars = memo(() => (
  <div className="flex flex-col gap-2" aria-hidden>
    <div className="h-2 w-3/5 rounded-full bg-secondary-300 dark:bg-secondary-600" />
    <div className="h-1.5 w-[92%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[85%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[94%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
    <div className="h-1.5 w-[70%] rounded-full bg-grey-200 dark:bg-grey-700/60" />
  </div>
));
PlaceholderBars.displayName = 'PlaceholderBars';

// Board overview for the preview plate. The card list doesn't carry real board
// rows (those live in Yjs, loaded only via /boards/:id/state), so we render a
// type-faithful schematic: a three-column Kanban (eucalyptus header bar over
// solid card blocks) or a grid of whiteboard sticky notes.
const KANBAN_COLUMNS = [
  { id: 'kanban-1', cards: 2 },
  { id: 'kanban-2', cards: 1 },
  { id: 'kanban-3', cards: 2 },
];

const WHITEBOARD_NOTES = [
  { id: 'wb-a', tint: 'bg-secondary-100 dark:bg-secondary-900/40' },
  { id: 'wb-b', tint: 'bg-primary-100 dark:bg-primary-900/40' },
  { id: 'wb-c', tint: 'bg-grey-100 dark:bg-grey-700/50' },
  { id: 'wb-d', tint: 'bg-secondary-50 dark:bg-secondary-900/30' },
  { id: 'wb-e', tint: 'bg-grey-100 dark:bg-grey-700/50' },
  { id: 'wb-f', tint: 'bg-primary-50 dark:bg-primary-900/30' },
];

const BoardPreviewBody = memo(({ boardType }: { boardType?: 'kanban' | 'whiteboard' }) => {
  if (boardType === 'whiteboard') {
    return (
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-2" aria-hidden>
        {WHITEBOARD_NOTES.map((note) => (
          <div key={note.id} className={cn('rounded-[5px]', note.tint)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2.5" aria-hidden>
      {KANBAN_COLUMNS.map((col) => (
        <div key={col.id} className="flex flex-1 flex-col gap-1.5">
          <div className="h-2 rounded-[3px] bg-secondary-300 dark:bg-secondary-600" />
          {Array.from({ length: col.cards }, (_, i) => (
            <div
              key={`${col.id}-${i}`}
              className="h-6 rounded-[5px] bg-grey-100 dark:bg-grey-700/50"
            />
          ))}
        </div>
      ))}
    </div>
  );
});
BoardPreviewBody.displayName = 'BoardPreviewBody';

// Spreadsheet preview for 'tabelle' docs: a schematic grid (A/B/C column
// headers + numbered row gutter) filled with the table's real leading cells when
// the content carries an HTML <table>, else faint placeholder bars. Reads as a
// spreadsheet at a glance — distinct from the prose plate a plain doc shows.
const COLUMN_LETTERS = ['A', 'B', 'C', 'D'];
const TABLE_PLACEHOLDER_ROWS = 4;

const TablePreviewBody = memo(({ content }: { content?: string }) => {
  const rows = content ? parseTablePreview(content) : [];
  const colCount = Math.min(
    COLUMN_LETTERS.length,
    Math.max(2, rows.reduce((max, row) => Math.max(max, row.length), 0) || 3)
  );
  const bodyRows: string[][] =
    rows.length > 0 ? rows : Array.from({ length: TABLE_PLACEHOLDER_ROWS }, () => []);
  const cols = COLUMN_LETTERS.slice(0, colCount);

  const cellBase =
    'flex items-center overflow-hidden px-2 text-[10.5px] leading-none border-r border-b';
  const gutterCell =
    'flex items-center justify-center text-[10px] leading-none border-r border-b bg-grey-50 text-grey-400 dark:bg-grey-800/60 dark:text-grey-500';

  return (
    <div
      className="grid text-left"
      style={{ gridTemplateColumns: `26px repeat(${colCount}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {/* Column header strip */}
      <div className="h-5 border-r border-b border-grey-200 bg-grey-100 dark:border-grey-700/60 dark:bg-grey-700/40" />
      {cols.map((letter) => (
        <div
          key={`h-${letter}`}
          className="flex h-5 items-center px-2 border-r border-b border-grey-200 bg-grey-100 text-[10px] font-bold text-grey-500 dark:border-grey-700/60 dark:bg-grey-700/40 dark:text-grey-400"
        >
          {letter}
        </div>
      ))}

      {bodyRows.map((row, rowIdx) => {
        const isHeaderRow = rowIdx === 0;
        return (
          <React.Fragment key={`row-${rowIdx}`}>
            <div className={cn(gutterCell, 'h-7')}>{rowIdx + 1}</div>
            {cols.map((letter, colIdx) => {
              const value = row[colIdx];
              return (
                <div
                  key={`c-${rowIdx}-${letter}`}
                  className={cn(
                    cellBase,
                    'h-7',
                    isHeaderRow
                      ? 'border-secondary-200 bg-secondary-50 font-semibold text-secondary-700 dark:border-secondary-800/60 dark:bg-secondary-900/30 dark:text-secondary-200'
                      : 'border-grey-100 text-grey-700 dark:border-grey-700/40 dark:text-grey-300'
                  )}
                >
                  {value ? (
                    <span className="truncate">{value}</span>
                  ) : (
                    <span
                      className={cn(
                        'h-1.5 w-3/4 rounded-full',
                        isHeaderRow
                          ? 'bg-secondary-300 dark:bg-secondary-600'
                          : 'bg-grey-200 dark:bg-grey-700/50'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
});
TablePreviewBody.displayName = 'TablePreviewBody';

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
            src={resolveApiAssetUrl(item.thumbnailUrl)}
            alt={item.title || FALLBACK_TITLES[item.type]}
            className="h-full w-full object-cover"
            loading="lazy"
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
  if ((item.type === 'doc' || item.type === 'text') && item.content?.trim()) {
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
    body = <BoardPreviewBody boardType={item.boardType} />;
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
    onConvertText,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
    onConvertText?: (textId: string) => void;
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

  const [expanded, setExpanded] = useState(false);

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
        onConvertText={handleConvertText}
      />
    );

  return (
    <section className="mb-xl">
      <SectionHeader title="Zuletzt" />

      {isLoading ? (
        <div className={RECENT_ROW_CLASS}>
          {Array.from({ length: 5 }, (_, i) => (
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
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Inhalte vorhanden.
        </p>
      ) : (
        <>
          {/* Collapsed: scrollable row sliced to the threshold. Expanded: every
              item in a wrapping grid (same card density as the row's ≈5/desktop). */}
          {expanded ? (
            <CardGrid columns="5" gap="md">
              {items.map(renderCard)}
            </CardGrid>
          ) : (
            <div className={RECENT_ROW_CLASS}>
              {items.slice(0, RECENT_COLLAPSE_THRESHOLD).map(renderCard)}
            </div>
          )}
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
