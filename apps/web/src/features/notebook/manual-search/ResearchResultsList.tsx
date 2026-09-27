import { CardGrid } from '@gruenerator/ui';
import { type ReactNode, useId } from 'react';
import { FiSearch } from 'react-icons/fi';

import IndexCard from '../../../components/common/IndexCard';

import { resultToCardProps } from './researchResultCard';
import { type ResearchResult } from './useResearch';

import type { ResearchSearchResponse } from '@gruenerator/contracts';

interface ResearchResultsListProps {
  results: ResearchResult[];
  metadata: ResearchSearchResponse['metadata'] | null;
  /** No answer yet for this search. */
  isPending: boolean;
  isError: boolean;
  /** Shown when the search came back empty — what the person can change. */
  emptyHint: string;
  /** Appended to the result count, e.g. „ · sortiert nach Neueste zuerst“. */
  metaSuffix?: string;
  /** Tighter grid for the omni dropdown. */
  compact?: boolean;
  /** Controls beside the result count (search options, chips). */
  toolbar?: ReactNode;
}

/** The research hit list — one rendering for the notebook start page and the
 *  omni composer's dropdown. */
export function ResearchResultsList({
  results,
  metadata,
  isPending,
  isError,
  emptyHint,
  metaSuffix = '',
  compact = false,
  toolbar,
}: ResearchResultsListProps) {
  const settled = !isPending && !isError;
  const headingId = useId();

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      {/* The cards title their hits as h3; this keeps the outline unbroken. */}
      <h2 id={headingId} className="sr-only">
        Treffer
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {/* Announces the count as it changes while the person types. */}
        <p className="text-xs text-muted-brand" aria-live="polite">
          {isPending
            ? 'Suche läuft …'
            : metadata
              ? `${metadata.totalResults} Ergebnisse in ${metadata.timeMs} ms${metaSuffix}`
              : ''}
        </p>
        {toolbar}
      </div>

      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Suche fehlgeschlagen. Bitte erneut versuchen.
        </p>
      )}

      {results.length > 0 && (
        <CardGrid
          columns="auto"
          gap={compact ? 'md' : '2xl'}
          className={compact ? undefined : 'max-md:gap-4'}
        >
          {results.map((r, i) => (
            <IndexCard key={`${r.document_id}-${r.collection_id ?? i}`} {...resultToCardProps(r)} />
          ))}
        </CardGrid>
      )}

      {settled && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FiSearch className="size-8 text-grey-300 dark:text-grey-600" aria-hidden />
          <p className="text-sm text-muted-brand">{emptyHint}</p>
        </div>
      )}
    </section>
  );
}
