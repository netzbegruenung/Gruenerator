import { MasonryGrid, MasonryItem } from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import { HiArrowUpTray, HiMagnifyingGlass } from 'react-icons/hi2';

import { cn } from '../../utils/cn';
import { buildPlacementUrl } from '../../utils/mediaPlacement';
import { SidebarHint } from '../components/SidebarHint';
import { SIDEBAR_SECTION } from '../sidebarStyles';
import { useImagePlacement } from '../useImagePlacement';
import { useUserUploads } from '../UserUploadsProvider';

import type { MediaItem } from '@gruenerator/shared/media-library';

export interface UploadsSectionProps {
  /** Places an image (freshly uploaded or an existing library item) onto the canvas. */
  onPlaceFromUrl?: (url: string, fileName: string) => void;
}

export function UploadsSection({ onPlaceFromUrl }: UploadsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    items,
    isLoading,
    error,
    search,
    setSearch,
    deleteFromLibrary,
    isUploading,
    uploadProgress,
    uploadError,
    hasMore,
    loadMore,
  } = useUserUploads();
  const { place } = useImagePlacement(onPlaceFromUrl);

  const [isDragOver, setIsDragOver] = useState(false);

  const acceptFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        await place(file, 'upload');
      } catch {
        // Upload failure is surfaced via `uploadError` from the provider.
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await acceptFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlace = (item: MediaItem) => {
    if (!onPlaceFromUrl) return;
    const url = buildPlacementUrl(item);
    if (!url) return;
    onPlaceFromUrl(url, item.originalFilename ?? item.title ?? 'image');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files.length) return;
    await acceptFiles(e.dataTransfer.files);
  };

  const showEmpty = !isLoading && items.length === 0 && !isUploading;
  const displayedError = uploadError ?? error;

  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-md p-md max-canvas-mobile:p-sm',
        isDragOver && 'ring-2 ring-primary-500 ring-offset-2'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
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
        disabled={isUploading}
        className="flex items-center justify-center gap-xs py-sm px-md bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <HiArrowUpTray size={16} />
        {isUploading ? `Lädt hoch… ${uploadProgress}%` : 'Dateien hochladen'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {displayedError ? (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1"
        >
          {displayedError}
        </div>
      ) : null}

      {(items.length > 0 || isUploading) && (
        <MasonryGrid columns="2" gap="sm">
          {isUploading ? (
            <MasonryItem className="relative aspect-square overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-background)] flex items-center justify-center">
              <div
                className="absolute inset-x-0 bottom-0 h-1 bg-primary-500 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
              <span className="text-[10px] text-foreground/60">{uploadProgress}%</span>
            </MasonryItem>
          ) : null}
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
                {item.thumbnailUrl ? (
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
