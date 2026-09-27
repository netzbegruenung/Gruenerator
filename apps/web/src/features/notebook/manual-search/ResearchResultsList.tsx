import { Button } from '@gruenerator/ui';
import { type ReactNode, useId } from 'react';

import { ResearchDocumentReader } from './ResearchDocumentReader';
import { ResearchHitCard, type ResearchView } from './ResearchHitCard';
import { type ResearchResult } from './useResearch';
import { useResearchReader } from './useResearchReader';

import type { ResearchSearchResponse } from '@gruenerator/contracts';

import { cn } from '@/utils/cn';

interface ResearchResultsListProps {
  results: ResearchResult[];
  metadata: ResearchSearchResponse['metadata'] | null;
  /** No answer yet for this search. */
  isPending: boolean;
  isError: boolean;
  /** Shown when the search came back empty — what the person can change. */
  emptyHint: string;
  /** Tighter grid for the omni dropdown. */
  compact?: boolean;
  /** Controls beside the result count (search options, chips). */
  toolbar?: ReactNode;
  view?: ResearchView;
  /** Offered in the empty state when the options narrowed the search. */
  onResetOptions?: () => void;
  /** The search behind these hits — the reader marks its terms. */
  query: string;
  /** Hits come from system collections, which the reader can open. A user
   *  notebook's hits carry the notebook's own id as `collection_id` instead. */
  readable?: boolean;
}

/** The research hit list — one rendering for the notebook start page and the
 *  omni composer's dropdown. */
export function ResearchResultsList({
  results,
  metadata,
  isPending,
  isError,
  emptyHint,
  compact = false,
  toolbar,
  view = 'grid',
  onResetOptions,
  query,
  readable = true,
}: ResearchResultsListProps) {
  const reader = useResearchReader();
  // User-notebook documents keep opening their source.
  const openHit = (r: ResearchResult) => {
    const collectionId = r.collection_id;
    const sourceUrl = r.source_url;
    if (!readable || !collectionId || !sourceUrl) return undefined;
    return () => reader.open({ collectionId, sourceUrl, query, title: r.title });
  };
  const settled = !isPending && !isError;
  const headingId = useId();
  const count = metadata?.totalResults ?? results.length;

  return (
    <section className="flex flex-col gap-4" aria-labelledby={headingId}>
      {/* The cards title their hits as h3; this keeps the outline unbroken. */}
      <h2 id={headingId} className="sr-only">
        Treffer
      </h2>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {/* Announces the count as it changes while the person types. */}
        <p
          className={cn(
            'm-0 mr-1 font-semibold text-foreground',
            compact ? 'text-xs' : 'text-[0.9375rem]'
          )}
          aria-live="polite"
        >
          {isPending ? 'Suche läuft …' : metadata ? `${count} Ergebnisse` : ''}
        </p>
        {toolbar}
      </div>

      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Suche fehlgeschlagen. Bitte erneut versuchen.
        </p>
      )}

      {results.length > 0 &&
        (view === 'list' ? (
          <div className="flex flex-col gap-2.5">
            {results.map((r, i) => (
              <ResearchHitCard
                key={`${r.document_id}-${r.collection_id ?? i}`}
                result={r}
                view="list"
                onOpen={openHit(r)}
              />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              'grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]',
              compact ? 'gap-3' : 'gap-5'
            )}
          >
            {results.map((r, i) => (
              <ResearchHitCard
                key={`${r.document_id}-${r.collection_id ?? i}`}
                result={r}
                view="grid"
                onOpen={openHit(r)}
              />
            ))}
          </div>
        ))}

      {settled && results.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-grey-300 px-6 py-14 text-center dark:border-grey-600">
          <p className="m-0 text-base text-grey-600 dark:text-grey-300">{emptyHint}</p>
          {onResetOptions && (
            <Button variant="brand-outline" size="brand-sm" onClick={onResetOptions}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
      )}

      {reader.target && (
        <ResearchDocumentReader
          key={reader.target.sourceUrl}
          target={reader.target}
          onClose={reader.close}
        />
      )}
    </section>
  );
}
