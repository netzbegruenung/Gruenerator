import { memo, type JSX } from 'react';
import { FiExternalLink, FiLoader } from 'react-icons/fi';

import { useCanvaDesigns } from '../hooks/useCanva';

/**
 * Read-only grid of the connected user's Canva designs (uses the
 * `design:meta:read` scope). Shows an explicit loading state on first fetch and
 * on "load more", as Canva's recommended practices require for paginated
 * resources. Each tile opens the design in Canva — we never re-create the
 * Canva editor.
 */
const CanvaDesignsGrid = memo(({ connected }: { connected: boolean }): JSX.Element | null => {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCanvaDesigns(connected);

  if (!connected) return null;

  const designs = data?.pages.flatMap((page) => page.designs) ?? [];

  return (
    <div className="mt-md">
      <h3 className="text-sm font-medium text-foreground-heading mb-sm">Deine Designs</h3>

      {isLoading && (
        <p className="flex items-center justify-center gap-2 text-sm text-grey-400 py-md">
          <FiLoader className="animate-spin" size={14} />
          Designs werden geladen…
        </p>
      )}

      {!isLoading && isError && (
        <p className="text-sm text-grey-400 py-sm">Designs konnten nicht geladen werden.</p>
      )}

      {!isLoading && !isError && designs.length === 0 && (
        <p className="text-sm text-grey-400 py-sm">Keine Designs gefunden.</p>
      )}

      {designs.length > 0 && (
        <ul className="grid grid-cols-2 gap-sm sm:grid-cols-3 md:grid-cols-4 list-none p-0 m-0">
          {designs.map((design) => (
            <li key={design.id}>
              <a
                href={design.editUrl || design.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden hover:border-primary-400 transition-colors"
                title={design.title}
              >
                <div className="aspect-[4/3] bg-background-alt flex items-center justify-center overflow-hidden">
                  {design.thumbnailUrl ? (
                    <img
                      src={design.thumbnailUrl}
                      alt={design.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FiExternalLink className="text-grey-300" size={18} />
                  )}
                </div>
                <span className="flex items-center gap-1 px-sm py-1 text-xs text-foreground truncate">
                  <span className="truncate">{design.title}</span>
                  <FiExternalLink
                    size={11}
                    className="shrink-0 text-grey-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <div className="flex justify-center mt-md">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 text-xs px-md py-1.5 rounded-md border border-grey-300 dark:border-grey-600 text-grey-600 dark:text-grey-300 hover:border-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFetchingNextPage ? (
              <>
                <FiLoader className="animate-spin" size={12} />
                Lädt…
              </>
            ) : (
              'Mehr laden'
            )}
          </button>
        </div>
      )}
    </div>
  );
});
CanvaDesignsGrid.displayName = 'CanvaDesignsGrid';

export default CanvaDesignsGrid;
