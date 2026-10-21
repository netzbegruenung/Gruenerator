import { useUnsplashSearch, type UnsplashSearchFn } from '@gruenerator/shared/image-studio';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PiMagnifyingGlass } from 'react-icons/pi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { UnsplashLimitNotice, UnsplashRemaining } from '../tools/UnsplashLimitNotice';

import { unsplashPhotoItem } from './useStockPhotos';

import type { ElementItem } from './elementTypes';

const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=gruenerator&utm_medium=referral';

/**
 * The Fotos category: the bundled photos (`children`), and below a search
 * query the live Unsplash search. That search spends the shared key's hourly
 * budget, so it runs only on an explicit click, never while typing.
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
  const { searchUnsplashImages } = useCanvasEditorServices();
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
  if (!searchUnsplashImages || !query) return children;

  // Results of an earlier query are hidden, not refetched: a new query costs a click.
  const isCurrent = lastQuery === query;
  const hasMore = isCurrent && items.length > 0 && searchResults.length < totalResults;

  return (
    <div className="flex flex-col gap-3 w-full">
      {children}

      <section aria-label="Fotos von Unsplash" className="flex flex-col gap-2.5">
        {limit ? (
          <UnsplashLimitNotice retryAt={limit.retryAt} />
        ) : (
          !isCurrent && (
            <button
              type="button"
              onClick={() => void searchUnsplash(query)}
              className="flex w-full items-center justify-center gap-2 h-10 rounded-lg border-[1.5px] border-[var(--editor-border-strong)] bg-transparent text-sm font-semibold text-[var(--editor-text)] cursor-pointer transition-colors duration-150 hover:border-[var(--editor-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
            >
              <PiMagnifyingGlass size={16} aria-hidden />
              Mehr Fotos bei Unsplash suchen
            </button>
          )
        )}

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
