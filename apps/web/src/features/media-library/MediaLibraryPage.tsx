import { type MediaItem } from '@gruenerator/shared/media-library';
import { Button } from '@gruenerator/ui';
import { useCallback, useRef, useState, type DragEvent, type JSX } from 'react';
import { HiArrowUpTray } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';

import {
  FilterChip,
  GalleryCountRow,
  GalleryEmptyState,
  GalleryGrid,
  GallerySkeleton,
  useGridSize,
} from '../../components/common/Gallery/parts';
import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import { PageHero, PageShell } from '../../components/common/PageHero';
import { ShareMediaModal } from '../../components/common/ShareMediaModal';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useTrashUndoToast } from '../trash/trashUndoToast';

import { LinkedEntryCard } from './components/LinkedEntryCard';
import { MediaCard } from './components/MediaCard';
import { MediaDetailDialog } from './components/MediaDetailDialog';
import { MediaToolbar, typeLabel } from './components/MediaToolbar';
import { UploadQueueList } from './components/UploadQueueList';
import { useMediaDownload } from './hooks/useMediaDownload';
import { useMediaLibraryFilters } from './hooks/useMediaLibraryFilters';
import { useMediathek, type MediathekEntry } from './hooks/useMediathek';
import { useUploadQueue } from './hooks/useUploadQueue';
import { mediaTitle } from './mediaFormat';

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

function MediaLibrary(): JSX.Element {
  const navigate = useNavigate();
  const filters = useMediaLibraryFilters();
  const {
    entries,
    total,
    hasMore,
    isLoading,
    isFetchingNextPage,
    error,
    loadMore,
    remove,
    update,
  } = useMediathek({ typ: filters.type, search: filters.search, sort: filters.sort });

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

  return (
    <PageShell wide>
      <div className="relative flex flex-col gap-md" {...dropProps}>
        <PageHero
          title="Mediathek"
          description={
            <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
              Deine Bilder, Sharepics, KI-Bilder, Reels, Videos und Audios an einem Ort.
            </p>
          }
          toolbar={
            <MediaToolbar
              filters={filters}
              gridSize={gridSize}
              onToggleGridSize={toggleGridSize}
              onFiles={enqueue}
            />
          }
        />

        <UploadQueueList queue={queue} progress={progress} onDismiss={dismiss} />

        {settled && !error && (
          <GalleryCountRow
            count={`${total} ${total === 1 ? 'Medium' : 'Medien'}`}
            onReset={filters.isFiltered ? filters.reset : undefined}
          >
            {filters.type !== 'all' && (
              <FilterChip label={typeLabel(filters.type)} onRemove={() => filters.setType('all')} />
            )}
            {filters.sort === 'oldest' && (
              <FilterChip label="Älteste zuerst" onRemove={() => filters.setSort('newest')} />
            )}
            {filters.searchInput.trim() && (
              <FilterChip
                label={`„${filters.searchInput.trim()}“`}
                onRemove={() => filters.setSearchInput('')}
              />
            )}
          </GalleryCountRow>
        )}

        <h2 className="sr-only">{typeLabel(filters.type)}</h2>
        {error ? (
          <p className="text-center text-error">{error}</p>
        ) : (
          <>
            <GalleryGrid size={gridSize}>
              {!settled && entries.length === 0 ? (
                <GallerySkeleton className="aspect-[4/5]" />
              ) : (
                entries.map((entry, index) =>
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
                      hint: 'Lade Bilder oder Videos hoch oder zieh sie hierher. Sharepics, KI-Bilder, Reels und Audios aus dem Studio landen automatisch hier.',
                    })}
              />
            )}

            {hasMore && (
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

const MediaLibraryPage = (): JSX.Element => {
  const { isAuthenticated, loading } = useOptimizedAuth();

  if (loading) {
    return (
      <PageShell wide>
        <PageHero title="Mediathek" />
        <GalleryGrid size="small">
          <GallerySkeleton className="aspect-[4/5]" />
        </GalleryGrid>
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <LoginRequired
          title="Mediathek"
          message="Melde dich an, um auf deine Mediathek zuzugreifen."
        />
      </PageShell>
    );
  }

  return <MediaLibrary />;
};

export default MediaLibraryPage;
