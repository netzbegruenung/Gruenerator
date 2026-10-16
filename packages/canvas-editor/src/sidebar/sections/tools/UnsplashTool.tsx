import { useUnsplashSearch, type UnsplashSearchFn } from '@gruenerator/shared/image-studio';
import { useCallback, useEffect, useState } from 'react';
import { HiMagnifyingGlass } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';

import type { StockImage } from '../../../common/imageSourceTypes';
import type { UserImagePlacement } from '../../../utils/userImageUtils';

export interface UnsplashToolProps {
  onPlaceImageUrl?: (url: string, fileName: string, options?: UserImagePlacement) => void;
}

const SEARCH_DEBOUNCE_MS = 400;
const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=gruenerator&utm_medium=referral';

/** Unsplash serves resized copies of the same hotlinked URL via imgix's `w`. */
function thumbnailUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('w', '400');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Unsplash search as a tool. A picked photo is placed by its hotlinked
 * Unsplash URL and keeps its credit — API Terms §6 forbid re-hosting the
 * unaltered photo, so it never goes through the uploads / Mediathek.
 */
export function UnsplashTool({ onPlaceImageUrl }: UnsplashToolProps) {
  const { searchUnsplashImages, trackUnsplashDownloadLive, trackUnsplashDownload } =
    useCanvasEditorServices();
  const searchFn = useCallback<UnsplashSearchFn>(
    (q, p, pp) =>
      searchUnsplashImages
        ? searchUnsplashImages(q, p, pp)
        : Promise.resolve({ results: [], total: 0, total_pages: 0 }),
    [searchUnsplashImages]
  );
  const {
    searchResults,
    totalResults,
    isLoadingSearch,
    searchError,
    lastQuery,
    searchUnsplash,
    loadMoreResults,
  } = useUnsplashSearch(searchFn);
  const [query, setQuery] = useState('');
  const [placedId, setPlacedId] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => void searchUnsplash(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, searchUnsplash]);

  const handlePick = (image: StockImage) => {
    if (!image.url || !onPlaceImageUrl) return;
    const downloadLocation = image.attribution?.downloadLocation;
    if (downloadLocation && trackUnsplashDownloadLive) {
      void trackUnsplashDownloadLive(downloadLocation);
    } else if (trackUnsplashDownload) {
      void trackUnsplashDownload(image);
    }
    onPlaceImageUrl(image.url, image.filename, { attribution: image.attribution });
    setPlacedId(image.filename);
  };

  const hasMore = searchResults.length > 0 && searchResults.length < totalResults;

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void searchUnsplash(query);
        }}
        className="relative"
      >
        <HiMagnifyingGlass
          size={16}
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--editor-text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z. B. Windrad, Fahrrad, Wald"
          aria-label="Fotos auf Unsplash suchen"
          className="w-full h-9 pl-8 pr-2 rounded-md border border-[var(--editor-border-strong)] bg-[var(--editor-surface)] text-sm text-[var(--editor-text)] placeholder:text-[var(--editor-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        />
      </form>

      {searchError && (
        <p role="alert" className="m-0 text-xs text-editor-danger-fg">
          {searchError}
        </p>
      )}

      {!lastQuery && !isLoadingSearch && (
        <p className="m-0 text-xs text-[var(--editor-text-muted)]">
          Suche ein Foto und tippe es an, um es auf die Fläche zu legen.
        </p>
      )}

      {lastQuery && !isLoadingSearch && searchResults.length === 0 && !searchError && (
        <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
          Keine Fotos zu „{lastQuery}“ gefunden.
        </p>
      )}

      {searchResults.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 m-0 p-0 list-none">
          {searchResults.map((image) => (
            <li key={image.filename} className="flex flex-col gap-1 min-w-0">
              <button
                type="button"
                onClick={() => handlePick(image)}
                aria-label={`Foto einfügen: ${image.alt_text ?? image.filename}`}
                className="block w-full aspect-square p-0 overflow-hidden rounded-md border-none bg-[var(--editor-tile)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
              >
                {image.url && (
                  <img
                    src={thumbnailUrl(image.url)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                )}
              </button>
              {image.attribution && (
                <a
                  href={image.attribution.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Foto von ${image.attribution.photographer} auf Unsplash`}
                  className="truncate text-[11px] text-[var(--editor-text-muted)] no-underline hover:underline"
                >
                  {image.attribution.photographer}
                </a>
              )}
              {placedId === image.filename && (
                <span role="status" className="text-[11px] text-[var(--editor-active-fg)]">
                  Eingefügt
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoadingSearch && (
        <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
          Lädt…
        </p>
      )}

      {hasMore && !isLoadingSearch && (
        <button
          type="button"
          onClick={() => void loadMoreResults()}
          className="h-9 rounded-md border border-[var(--editor-border-strong)] bg-transparent text-sm text-[var(--editor-text)] cursor-pointer hover:bg-[var(--editor-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          Mehr laden ({searchResults.length} von {totalResults})
        </button>
      )}

      <p className="m-0 text-[11px] text-[var(--editor-text-muted)]">
        Fotos von{' '}
        <a
          href={UNSPLASH_HOME}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--editor-text)] underline"
        >
          Unsplash
        </a>{' '}
        – kostenlos nutzbar nach der Unsplash-Lizenz.
      </p>
    </div>
  );
}
