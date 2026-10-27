import { useCallback, useEffect, useMemo, type ReactNode } from 'react';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useNoUnsplashSearch, type UnsplashSearchFn } from '../../../hostServices';
import { UnsplashLimitNotice, UnsplashRemaining } from '../tools/UnsplashLimitNotice';

import { unsplashPhotoItem } from './useStockPhotos';

import type { ElementItem } from './elementTypes';

/** On top of the panel's own 200 ms, so a typing pause, not every key, costs a search. */
const SEARCH_DEBOUNCE_MS = 400;
const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=gruenerator&utm_medium=referral';

/**
 * The Fotos category: the bundled photos (`children`), and below a search
 * query the live Unsplash search. Each search spends one of the shared key's
 * 50 hourly requests; once they are gone the notice says so.
 */
export function FotosCatalog({
  searchQuery,
  grid,
  children,
}: {
  searchQuery: string;
  grid: (items: readonly ElementItem[]) => ReactNode;
  children: ReactNode;
}) {
  // `useUnsplashSearch` is a host hook, fixed for the lifetime of the editor.
  const { searchUnsplashImages, useUnsplashSearch = useNoUnsplashSearch } =
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
    limit,
    remaining,
    lastQuery,
    searchUnsplash,
    loadMoreResults,
  } = useUnsplashSearch(searchFn);
  const items = useMemo(
    () => searchResults.filter((image) => image.url).map(unsplashPhotoItem),
    [searchResults]
  );

  const query = searchQuery.trim();
  const canSearch = searchUnsplashImages !== undefined && query.length > 0;

  // While blocked a request would only fetch the same refusal.
  useEffect(() => {
    if (!canSearch || limit) return;
    const id = setTimeout(() => void searchUnsplash(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [canSearch, limit, query, searchUnsplash]);

  if (!canSearch) return children;

  const isCurrent = lastQuery === query;
  const hasMore = isCurrent && items.length > 0 && searchResults.length < totalResults;

  return (
    <div className="flex flex-col gap-3 w-full">
      {children}

      <section aria-label="Fotos von Unsplash" className="flex flex-col gap-2.5">
        <h4 className="m-0 text-sm font-bold text-[var(--editor-text)]">Mehr von Unsplash</h4>

        {limit && <UnsplashLimitNotice retryAt={limit.retryAt} />}

        {isCurrent && searchError && (
          <p role="alert" className="m-0 text-xs text-editor-danger-fg">
            {searchError}
          </p>
        )}

        {isCurrent && items.length > 0 && grid(items)}

        {isCurrent && !isLoadingSearch && !searchError && !limit && items.length === 0 && (
          <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
            Auch auf Unsplash keine Fotos zu „{query}“ gefunden.
          </p>
        )}

        {isLoadingSearch && (
          <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
            Sucht auf Unsplash …
          </p>
        )}

        {hasMore && !isLoadingSearch && !limit && (
          <button
            type="button"
            onClick={() => void loadMoreResults()}
            className="h-9 rounded-md border border-[var(--editor-border-strong)] bg-transparent text-sm text-[var(--editor-text)] cursor-pointer hover:bg-[var(--editor-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            Mehr laden ({searchResults.length} von {totalResults})
          </button>
        )}

        {isCurrent && (
          <>
            {!limit && <UnsplashRemaining remaining={remaining} />}
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
          </>
        )}
      </section>
    </div>
  );
}
