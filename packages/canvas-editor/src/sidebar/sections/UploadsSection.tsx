import { MasonryGrid, MasonryItem } from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import { HiArrowUpTray, HiMagnifyingGlass } from 'react-icons/hi2';

import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { cn } from '../../utils/cn';
import { buildPlacementUrl } from '../../utils/mediaPlacement';
import { downscaleImageForUpload } from '../../utils/userImageUtils';
import { MediaThumb } from '../components/MediaThumb';
import { SidebarHint } from '../components/SidebarHint';
import { SIDEBAR_SECTION } from '../sidebarStyles';
import { useUserUploads } from '../UserUploadsProvider';

import type { MediaItem } from '@gruenerator/shared/media-library';

export interface UploadsSectionProps {
  /** Place an already-durable URL (used when clicking a prior upload). */
  onPlaceFromUrl?: (url: string, fileName: string) => void;
  /** Place a freshly-picked file instantly (local blob), returning its id. */
  onPlaceLocalFile?: (file: File) => Promise<string>;
  /** Swap an optimistically-placed instance's src to the durable URL. */
  onSwapPlacedUrl?: (id: string, url: string) => void;
  /** Remove an optimistically-placed instance if its upload fails. */
  onRemovePlaced?: (id: string) => void;
}

export function UploadsSection({
  onPlaceFromUrl,
  onPlaceLocalFile,
  onSwapPlacedUrl,
  onRemovePlaced,
}: UploadsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsCanvasMobile();
  const {
    items,
    isLoading,
    error,
    search,
    setSearch,
    upload,
    deleteFromLibrary,
    uploadError,
    hasMore,
    loadMore,
  } = useUserUploads();

  const [isDragOver, setIsDragOver] = useState(false);
  // Track in-flight uploads locally: uploads run in parallel but share one
  // useMediaUpload mutation, so its `isUploading` flips false after the first
  // completes. This counter reflects the whole batch.
  const [activeUploads, setActiveUploads] = useState(0);

  // One file: place a local blob preview on the canvas instantly, then upload
  // (downscaled) in the background and swap the blob for the durable URL. If the
  // upload fails (unsupported type, network, quota) the optimistic instance is
  // rolled back so no unbacked blob: image is left on the canvas.
  const handleOneFile = async (file: File) => {
    const placedId = onPlaceLocalFile ? await onPlaceLocalFile(file).catch(() => null) : null;
    setActiveUploads((n) => n + 1);
    try {
      const toUpload = await downscaleImageForUpload(file);
      const result = await upload(toUpload);
      const url = result ? buildPlacementUrl(result) : null;
      if (!url) {
        if (placedId && onRemovePlaced) onRemovePlaced(placedId);
        return;
      }
      if (placedId && onSwapPlacedUrl) {
        onSwapPlacedUrl(placedId, url);
      } else if (!placedId && onPlaceFromUrl) {
        onPlaceFromUrl(url, result?.originalFilename ?? result?.title ?? file.name);
      }
    } finally {
      setActiveUploads((n) => n - 1);
    }
  };

  const acceptFiles = (files: FileList | File[]) => {
    // Fire all uploads in parallel; each places optimistically on its own.
    Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .forEach((file) => void handleOneFile(file));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    acceptFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlace = (item: MediaItem) => {
    if (!onPlaceFromUrl) return;
    const url = buildPlacementUrl(item);
    if (!url) return;
    onPlaceFromUrl(url, item.originalFilename ?? item.title ?? 'image');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files.length) return;
    acceptFiles(e.dataTransfer.files);
  };

  const isBusy = activeUploads > 0;
  const showEmpty = !isLoading && items.length === 0 && !isBusy;
  const displayedError = uploadError ?? error;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={handleFileChange}
      className="hidden"
    />
  );

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    },
    onDragLeave: () => setIsDragOver(false),
    onDrop: handleDrop,
  };

  if (isMobile) {
    // Mobiles Sheet: Suchfeld, dann ein 3er-Raster, dessen erste Kachel der
    // Upload ist. Das Sheet stellt den Seitenabstand, daher kein Padding hier.
    return (
      <div
        className={cn(
          'flex flex-col gap-4 rounded-xl',
          isDragOver && 'ring-2 ring-[var(--editor-accent)] ring-offset-2'
        )}
        {...dragProps}
      >
        <div className="relative">
          <HiMagnifyingGlass
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--editor-text-muted)] pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Eigene Bilder durchsuchen"
            className="w-full h-11 pl-10 pr-3 rounded-xl border-none bg-[var(--editor-tile)] text-sm text-[var(--editor-text)] placeholder:text-[var(--editor-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          />
        </div>

        {fileInput}

        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="aspect-square rounded-xl border-[1.5px] border-dashed border-[var(--editor-border-strong)] bg-transparent text-[var(--editor-text-secondary)] flex flex-col items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <HiArrowUpTray size={22} />
            <span className="text-xs font-semibold">
              {isBusy ? (activeUploads > 1 ? `Lädt ${activeUploads}…` : 'Lädt…') : 'Hochladen'}
            </span>
          </button>
          {Array.from({ length: activeUploads }).map((_, i) => (
            <div
              key={`uploading-${i}`}
              className="aspect-square rounded-xl bg-[var(--editor-tile)] animate-pulse"
              aria-label="Lädt hoch…"
            />
          ))}
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--editor-tile)]"
            >
              <button
                type="button"
                onClick={() => handlePlace(item)}
                className="block size-full p-0 bg-transparent border-none cursor-pointer [&_picture]:size-full [&_img]:size-full [&_img]:object-cover"
                title={item.title ?? item.originalFilename ?? ''}
              >
                {item.shareToken ? (
                  <MediaThumb item={item} alt={item.altText ?? item.title ?? ''} sizes="140px" />
                ) : item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.altText ?? item.title ?? ''}
                    className="size-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void deleteFromLibrary(item.id)}
                aria-label="Bild aus Bibliothek entfernen"
                className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/60 text-white border-none rounded-md cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100"
              >
                <FaTrash size={10} />
              </button>
            </div>
          ))}
        </div>

        {displayedError ? (
          <p role="alert" className="m-0 text-xs text-[var(--editor-text-muted)]">
            {displayedError}
          </p>
        ) : null}

        {hasMore && !isLoading ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="self-center text-xs font-semibold text-[var(--editor-active-fg)] bg-transparent border-none cursor-pointer"
          >
            Mehr anzeigen
          </button>
        ) : null}

        {showEmpty ? (
          <p className="m-0 text-xs text-[var(--editor-text-muted)]">
            Lade eigene Bilder hoch, um sie auf der Leinwand zu platzieren.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-md p-md',
        isDragOver && 'ring-2 ring-primary-500 ring-offset-2'
      )}
      {...dragProps}
    >
      <div className="relative">
        <HiMagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50 pointer-events-none"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Bilder durchsuchen"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--card-background)] border border-[var(--card-border)] text-sm focus:outline-none focus:border-primary-500"
        />
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        className="flex items-center justify-center gap-xs py-sm px-md bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <HiArrowUpTray size={16} />
        {isBusy
          ? activeUploads > 1
            ? `Lädt ${activeUploads} Bilder hoch…`
            : 'Lädt hoch…'
          : 'Dateien hochladen'}
      </button>

      {fileInput}

      {displayedError ? (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1"
        >
          {displayedError}
        </div>
      ) : null}

      {(items.length > 0 || isBusy) && (
        <MasonryGrid columns="2" gap="sm">
          {Array.from({ length: activeUploads }).map((_, i) => (
            <MasonryItem
              key={`uploading-${i}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-background)] flex items-center justify-center animate-pulse"
            >
              <span className="text-[10px] text-foreground/60">Lädt hoch…</span>
            </MasonryItem>
          ))}
          {items.map((item) => (
            <MasonryItem
              key={item.id}
              className="group relative overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-background)] transition-colors duration-150 hover:border-primary-500"
            >
              <button
                type="button"
                onClick={() => handlePlace(item)}
                className="relative block w-full p-0 bg-transparent border-none cursor-pointer"
                title={item.title ?? item.originalFilename ?? ''}
              >
                {item.shareToken ? (
                  <MediaThumb item={item} alt={item.altText ?? item.title ?? ''} />
                ) : item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.altText ?? item.title ?? ''}
                    className="w-full h-auto"
                    draggable={false}
                  />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void deleteFromLibrary(item.id)}
                aria-label="Bild aus Bibliothek entfernen"
                className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/60 text-white border-none rounded-md cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100"
              >
                <FaTrash size={10} />
              </button>
            </MasonryItem>
          ))}
        </MasonryGrid>
      )}

      {hasMore && !isLoading ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="text-xs text-primary-600 hover:underline self-center cursor-pointer bg-transparent border-none"
        >
          Mehr anzeigen
        </button>
      ) : null}

      {showEmpty ? (
        <SidebarHint>
          Lade eigene Bilder hoch, um sie auf der Leinwand zu platzieren. Du kannst sie auch per
          Drag &amp; Drop in dieses Feld ziehen.
        </SidebarHint>
      ) : null}
    </div>
  );
}
