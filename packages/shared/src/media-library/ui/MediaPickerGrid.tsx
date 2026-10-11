import { Button, Input } from '@gruenerator/ui';
import { useEffect, useRef, useState } from 'react';
import { HiArrowUpTray, HiMagnifyingGlass } from 'react-icons/hi2';

import { acceptForMediaType } from '../constants.js';
import { useMediaLibrary } from '../hooks/useMediaLibrary.js';
import { useMediaUpload } from '../hooks/useMediaUpload.js';

import { MediaTile } from './MediaTile.js';

import type { MediaItem, MediaType, MediaUploadResult, UploadSource } from '../types.js';
import type { SharedMediaUrlOptions } from './SharedMediaPicture.js';

const SEARCH_DEBOUNCE_MS = 300;

export interface MediaPickerGridProps extends SharedMediaUrlOptions {
  /** Which library items to offer; also restricts the upload. */
  type?: MediaType;
  selectedIds?: readonly string[];
  onPick: (item: MediaItem) => void;
  /** A file uploaded from here landed in the library. */
  onUploaded?: (result: MediaUploadResult) => void;
  uploadSource?: UploadSource;
  /** Hint under „Keine Medien gefunden“ for an empty library. */
  emptyHint?: string;
  /** `sizes` for the tiles; defaults to the ~140px picker column. */
  sizes?: string;
}

/**
 * Search, upload and a grid of selectable library tiles — the body of every
 * „aus der Mediathek wählen" dialog. The dialog around it owns what a pick
 * means (confirm, alt text, insert).
 */
export function MediaPickerGrid({
  type = 'image',
  selectedIds = [],
  onPick,
  onUploaded,
  uploadSource = 'upload',
  emptyHint = 'Lade dein erstes Bild hoch, um loszulegen.',
  sizes = '(max-width: 600px) 100px, 140px',
  ...urlOptions
}: MediaPickerGridProps) {
  const { items, isLoading, isFetchingNextPage, pagination, error, setFilters, loadMore } =
    useMediaLibrary({ initialFilters: { type } });
  const { upload, isUploading, progress, error: uploadError } = useMediaUpload();
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setFilters({ search: search.trim() || undefined }),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [search, setFilters]);

  const handleFile = async (file: File) => {
    const result = await upload(file, { uploadSource });
    if (result) onUploaded?.(result);
  };

  const shownError = uploadError ?? error;

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative min-w-[12rem] flex-1">
          <HiMagnifyingGlass
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-grey-500"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mediathek durchsuchen …"
            aria-label="Mediathek durchsuchen"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
        >
          <HiArrowUpTray aria-hidden className="size-4" />
          {isUploading ? `Lädt hoch … ${Math.round(progress)} %` : 'Hochladen'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={acceptForMediaType(type)}
          aria-label="Datei hochladen"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {shownError && (
        <p role="alert" className="m-0 text-sm text-error">
          {shownError}
        </p>
      )}

      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 max-[600px]:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="aspect-square animate-pulse rounded-lg bg-background-alt"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="m-0 font-semibold text-foreground-heading">Keine Medien gefunden</p>
          {!search && <p className="m-0 mt-1 text-sm text-foreground/60">{emptyHint}</p>}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-0 max-[600px]:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
          {items.map((item) => (
            <li key={item.id}>
              <MediaTile
                item={item}
                selected={selectedIds.includes(item.id)}
                onPick={onPick}
                sizes={sizes}
                {...urlOptions}
              />
            </li>
          ))}
        </ul>
      )}

      {pagination.hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => void loadMore()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
        </Button>
      )}
    </div>
  );
}
