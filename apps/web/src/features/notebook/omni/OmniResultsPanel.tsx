import {
  activeFiltersToApi,
  describeParsedFilters,
  parsedSearchScope,
  type ParsedResearchIntent,
} from '@gruenerator/shared/utils';
import { useEffect, useMemo, useState } from 'react';

import { ParsedFilterChips } from '../manual-search/ParsedFilterChips';
import { ResearchResultsList } from '../manual-search/ResearchResultsList';
import { useResearch } from '../manual-search/useResearch';

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
    const { collectionIds, filters } = parsedSearchScope(parsed, dropped);
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
      <div className="mb-2">
        <ParsedFilterChips
          chips={chips}
          onDrop={(key) => setDropped((prev) => new Set(prev).add(key))}
        />
      </div>

      <ResearchResultsList
        query={parsed.semanticQuery}
        results={results}
        metadata={metadata}
        isPending={isLoading}
        isError={!!error}
        emptyHint="Keine Ergebnisse. Entferne einen Filter oben oder formuliere die Frage um."
        compact
      />
    </div>
  );
}
