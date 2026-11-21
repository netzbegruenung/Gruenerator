import { type MediaItem } from '@gruenerator/shared/media-library';
import { Button } from '@gruenerator/ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type RefObject,
} from 'react';
import { HiArrowUpTray } from 'react-icons/hi2';
import { Link, useNavigate } from 'react-router-dom';

import {
  GalleryEmptyState,
  GalleryGrid,
  GallerySkeleton,
  useGridSize,
} from '../../components/common/Gallery/parts';
import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import { PageHero, PageHeroSearch, PageShell } from '../../components/common/PageHero';
import { ShareMediaModal } from '../../components/common/ShareMediaModal';
import { getIcon } from '../../config/icons';
import { CANVAS_TOOLS, filterWorkplaceTools } from '../../config/workplaceToolsConfig';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useFirstName } from '../../hooks/useFirstName';
import VideoProjectsSection from '../image-studio/components/VideoProjectsSection';
import { SubscribedCollectionSection } from '../marketplace/SubscribedCollectionSection';
import { LinkedEntryCard } from '../media-library/components/LinkedEntryCard';
import { MediaCard } from '../media-library/components/MediaCard';
import { MediaDetailDialog } from '../media-library/components/MediaDetailDialog';
import { MediaToolbar } from '../media-library/components/MediaToolbar';
import { UploadQueueList } from '../media-library/components/UploadQueueList';
import { useMediaDownload } from '../media-library/hooks/useMediaDownload';
import { useMediaLibraryFilters } from '../media-library/hooks/useMediaLibraryFilters';
import { useMediathek, type MediathekEntry } from '../media-library/hooks/useMediathek';
import { useUploadQueue } from '../media-library/hooks/useUploadQueue';
import { mediaTitle } from '../media-library/mediaFormat';
import { useTrashUndoToast } from '../trash/trashUndoToast';
import { PopularVorlagenRow } from '../vorlagen/components/PopularVorlagenRow';
import { OfficeLinkPill } from '../workplace/components/ToolsSection';

import { cn } from '@/utils/cn';

const canShare = (item: MediaItem) => item.mediaType !== 'audio';

/** Counts enter/leave pairs, so moving over child tiles does not flicker the drop hint. */
function useFileDrop(onFiles: (files: FileList) => void) {
  const depth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  return {
    isDragging,
    dropProps: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setIsDragging(true);
      },
      onDragOver: (e: DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      onDragLeave: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsDragging(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setIsDragging(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      },
    },
  };
}

/** Column count of the grid inside `ref`; 0 while unknown (no layout, e.g. in tests). */
function useGridColumns(ref: RefObject<HTMLDivElement | null>, gridSize: string): number {
  const [cols, setCols] = useState(0);
  useEffect(() => {
    const grid = ref.current?.firstElementChild;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    // Fires once on observe, then on every resize (the breakpoints change the columns).
    const observer = new ResizeObserver(() => {
      const tracks = getComputedStyle(grid).gridTemplateColumns;
      setCols(tracks && tracks !== 'none' ? tracks.split(' ').length : 0);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [ref, gridSize]);
  return cols;
}

/** „Deine Inhalte" opens on two rows; „Mehr anzeigen" shows the rest. */
const COLLAPSED_ROWS = 2;

/** Every Studio tile wears the page's green (`TOOL_THEME.canvas`), not its own hue. */
const STUDIO_THEME = 'canvas';
const HERO_DESCRIPTION = 'Videos, Sharepics, KI-Bilder und Uploads an einem Ort.';

const StickerIcon = getIcon('navigation', 'sticker')!;

/** The Studio's video tools as a row of pills (title and icon only). */
function StudioTiles(): JSX.Element {
  return (
    <nav aria-label="Neu erstellen" className="flex flex-wrap gap-2">
      {filterWorkplaceTools(CANVAS_TOOLS).map((tool) => (
        <OfficeLinkPill key={tool.id} tool={tool} themeKey={STUDIO_THEME} />
      ))}
    </nav>
  );
}

function Studio(): JSX.Element {
  const firstName = useFirstName();
  const navigate = useNavigate();
  const filters = useMediaLibraryFilters();
  const { entries, hasMore, isLoading, isFetchingNextPage, error, loadMore, remove, update } =
    useMediathek({ typ: filters.type, search: filters.search, sort: filters.sort });

  const [gridSize, toggleGridSize] = useGridSize('mediathek-grid-size');
  const { queue, progress, enqueue, dismiss } = useUploadQueue();
  const { isDragging, dropProps } = useFileDrop(enqueue);
  const download = useMediaDownload();
  const showTrashUndo = useTrashUndoToast();

  const [openId, setOpenId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<MediaItem | null>(null);
  const openItem =
    entries.flatMap((entry) =>
      entry.kind === 'media' && entry.id === openId ? [entry.item] : []
    )[0] ?? null;

  // DELETE /api/media/:id takes the row id; the trash addresses a share by its token.
  const handleDeleteEntry = useCallback(
    async (entry: MediathekEntry) => {
      if (!(await remove(entry))) return;
      if (entry.kind === 'media') {
        setOpenId((current) => (current === entry.id ? null : current));
        showTrashUndo({ kind: 'shared_media', id: entry.item.shareToken, title: entry.item.title });
      } else {
        showTrashUndo({
          kind: entry.kind === 'canvas' ? 'collaborative_document' : 'subtitler_project',
          id: entry.id,
          title: entry.title,
        });
      }
    },
    [remove, showTrashUndo]
  );
  const handleDelete = useCallback(
    (item: MediaItem) => handleDeleteEntry({ kind: 'media', id: item.id, item }),
    [handleDeleteEntry]
  );
  const handleOpenLinked = useCallback(
    (entry: Exclude<MediathekEntry, { kind: 'media' }>) => void navigate(entry.href),
    [navigate]
  );
  const handleDeleteLinked = useCallback(
    (entry: Exclude<MediathekEntry, { kind: 'media' }>) => void handleDeleteEntry(entry),
    [handleDeleteEntry]
  );

  const handleOpen = useCallback((item: MediaItem) => setOpenId(item.id), []);
  const handleShare = useCallback((item: MediaItem) => {
    setOpenId(null);
    setSharing(item);
  }, []);
  const handleDeleteCard = useCallback(
    (item: MediaItem) => void handleDelete(item),
    [handleDelete]
  );
  const handleDownload = useCallback((item: MediaItem) => void download(item), [download]);

  const settled = !isLoading;
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef, gridSize);
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded && columns > 0;
  const shown = collapsed ? entries.slice(0, columns * COLLAPSED_ROWS) : entries;
  const canExpand = collapsed && (entries.length > shown.length || hasMore);

  return (
    <PageShell wide>
      <div className="relative flex flex-col gap-lg pt-lg" {...dropProps}>
        <PageHero
          title={firstName ? `Dein Studio, ${firstName}` : 'Dein Studio'}
          description={
            <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
              {HERO_DESCRIPTION}
            </p>
          }
          toolbar={
            <>
              <PageHeroSearch
                query={filters.searchInput}
                onQuery={filters.setSearchInput}
                placeholder="Studio durchsuchen…"
              />
              <Button asChild variant="ghost" size="icon">
                <Link
                  to="/studio/sticker"
                  aria-label="Sticker & Hintergründe"
                  title="Sticker & Hintergründe"
                >
                  <StickerIcon aria-hidden className="size-[18px]" />
                </Link>
              </Button>
            </>
          }
        />

        <StudioTiles />

        <SubscribedCollectionSection show="assets" />

        {/* Video-Editor projects live outside the Mediathek query; the section hides when empty. */}
        <VideoProjectsSection />

        <UploadQueueList queue={queue} progress={progress} onDismiss={dismiss} />

        <section aria-labelledby="studio-inhalte" className="flex flex-col gap-md">
          <div className="mt-md flex flex-wrap items-center justify-between gap-x-lg gap-y-sm">
            <h2 id="studio-inhalte" className="text-xl font-semibold text-foreground-heading">
              Deine Inhalte
            </h2>
            <MediaToolbar filters={filters} gridSize={gridSize} onToggleGridSize={toggleGridSize} />
          </div>

          {error ? (
            <p className="text-center text-error">{error}</p>
          ) : (
            <>
              <div ref={gridRef}>
                <GalleryGrid size={gridSize}>
                  {!settled && entries.length === 0 ? (
                    <GallerySkeleton className="aspect-[4/5]" />
                  ) : (
                    shown.map((entry, index) =>
                      entry.kind === 'media' ? (
                        <MediaCard
                          key={`media-${entry.id}`}
                          item={entry.item}
                          index={index}
                          onOpen={handleOpen}
                          onDownload={handleDownload}
                          onShare={canShare(entry.item) ? handleShare : undefined}
                          onDelete={handleDeleteCard}
                        />
                      ) : (
                        <LinkedEntryCard
                          key={`${entry.kind}-${entry.id}`}
                          entry={entry}
                          onOpen={handleOpenLinked}
                          onDelete={handleDeleteLinked}
                        />
                      )
                    )
                  )}
                  {isFetchingNextPage && <GallerySkeleton count={4} className="aspect-[4/5]" />}
                </GalleryGrid>
              </div>

              {settled && entries.length === 0 && (
                <GalleryEmptyState
                  {...(filters.isFiltered
                    ? {
                        title: 'Keine Medien gefunden',
                        hint: 'Versuche einen anderen Suchbegriff oder Filter.',
                        action: (
                          <Button variant="outline" size="sm" onClick={filters.reset}>
                            Alle Medien anzeigen
                          </Button>
                        ),
                      }
                    : {
                        title: 'Noch keine Medien',
                        hint: 'Zieh Bilder oder Videos hierher. Was du im Chat an Sharepics und KI-Bildern erstellst, landet automatisch hier, ebenso Reels und Audios.',
                      })}
                />
              )}

              {canExpand && (
                <Button variant="outline" className="self-center" onClick={() => setExpanded(true)}>
                  Mehr anzeigen
                </Button>
              )}

              {hasMore && !collapsed && (
                <Button
                  variant="outline"
                  className="self-center"
                  onClick={() => void loadMore()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
                </Button>
              )}
            </>
          )}
        </section>

        <PopularVorlagenRow />

        {isDragging && (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute -inset-2 z-10 flex flex-col items-center justify-center gap-sm',
              'rounded-2xl border-2 border-dashed border-primary-500 bg-primary-500/10 text-lg font-semibold text-primary-600 dark:text-primary-400'
            )}
          >
            <HiArrowUpTray className="size-10" />
            Dateien hier ablegen
          </div>
        )}
      </div>

      {openItem && (
        <MediaDetailDialog
          item={openItem}
          onClose={() => setOpenId(null)}
          onSave={update}
          onDownload={handleDownload}
          onShare={canShare(openItem) ? handleShare : undefined}
          onDelete={handleDeleteCard}
        />
      )}

      {sharing && (
        <ShareMediaModal
          isOpen
          onClose={() => setSharing(null)}
          mediaType={sharing.mediaType === 'video' ? 'video' : 'image'}
          existingShare={{
            shareToken: sharing.shareToken,
            mediaType: sharing.mediaType === 'video' ? 'video' : 'image',
            title: mediaTitle(sharing),
            status: 'ready',
            createdAt: sharing.createdAt,
          }}
        />
      )}
    </PageShell>
  );
}

const StudioPage = (): JSX.Element => {
  const { isAuthenticated, loading } = useOptimizedAuth();

  if (loading) {
    return (
      <PageShell wide>
        <PageHero title="Dein Studio" />
        <GalleryGrid size="small">
          <GallerySkeleton className="aspect-[4/5]" />
        </GalleryGrid>
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <LoginRequired title="Studio" message="Melde dich an, um dein Studio zu öffnen." />
      </PageShell>
    );
  }

  return <Studio />;
};

export default StudioPage;
