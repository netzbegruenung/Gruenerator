import { CardGrid } from '@gruenerator/ui';
import { useEffect, useMemo, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

import IndexCard from '../../../components/common/IndexCard';
import { resultToCardProps } from '../manual-search/researchResultCard';
import { useResearch } from '../manual-search/useResearch';
import { activeFiltersToApi, type ActiveFilters } from '../manual-search/useResearchFilters';

import { describeParsedFilters, type ParsedResearchIntent } from './parseResearchIntent';

/**
 * Inline research results for the omni composer: runs the parsed NL query as a
 * filtered research search and lists hits, with the detected filters shown as
 * droppable chips (removing one re-runs the search without that dimension).
 */
export function OmniResultsPanel({ parsed }: { parsed: ParsedResearchIntent }) {
  const { results, metadata, isLoading, error, search } = useResearch();
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const chips = useMemo(
    () => describeParsedFilters(parsed).filter((c) => !dropped.has(c.key)),
    [parsed, dropped]
  );

  const droppedSig = [...dropped].sort().join(',');

  useEffect(() => {
    const filters: ActiveFilters = {};
    for (const field of ['published_at', 'themes', 'content_type'] as const) {
      if (!dropped.has(field) && parsed.filters[field]) filters[field] = parsed.filters[field];
    }
    const collectionIds = dropped.has('region') ? undefined : parsed.collectionIds;
    void search({
      query: parsed.semanticQuery,
      collectionIds,
      filters: activeFiltersToApi(filters),
      mode: 'hybrid',
      sortBy: parsed.sortBy ?? 'relevance',
    });
    // Re-search when a chip is dropped; `search` is stable and `parsed` is fixed per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedSig]);

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[440px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[#E1E9E4] bg-white p-3 shadow-[0_20px_50px_rgba(31,63,51,.18)] dark:border-grey-700 dark:bg-grey-800">
      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setDropped((prev) => new Set(prev).add(chip.key))}
              className="flex items-center gap-1 rounded-full bg-[#FBE4F0] px-2.5 py-1 text-xs font-medium text-[#B4005C] transition-colors hover:bg-[#F5CFE2] dark:bg-[#3A1E2C] dark:text-[#F2A9CE]"
            >
              {chip.label}
              <FiX size={12} />
            </button>
          ))}
        </div>
      )}

      {error && <p className="px-1 py-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading && <p className="px-1 py-6 text-center text-sm text-[#9AA8A1]">Suche läuft …</p>}

      {!isLoading && !error && metadata && (
        <p className="mb-2 px-1 text-xs text-[#9AA8A1]">
          {metadata.totalResults} Ergebnisse in {metadata.timeMs}ms
        </p>
      )}

      {!isLoading && results.length > 0 && (
        <CardGrid columns="auto" gap="md">
          {results.map((r, i) => (
            <IndexCard key={`${r.document_id}-${r.collection_id ?? i}`} {...resultToCardProps(r)} />
          ))}
        </CardGrid>
      )}

      {!isLoading && !error && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FiSearch className="size-8 text-grey-300 dark:text-grey-600" />
          <p className="text-sm text-[#9AA8A1]">
            Keine Ergebnisse. Entferne einen Filter oben oder formuliere die Frage um.
          </p>
        </div>
      )}
    </div>
  );
}
