import { type OfficeSearchItem } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import useDebounce from '../../components/hooks/useDebounce';

/** Below this the instant client-side title match already covers the query. */
export const MIN_OFFICE_QUERY_LENGTH = 2;

const DEBOUNCE_MS = 200;

async function fetchOfficeSearch(query: string): Promise<OfficeSearchItem[]> {
  const result = await getContractsClient().globalSearch.officeSearch({ query: { q: query } });
  if (result.status !== 200) throw new Error('Office-Suche fehlgeschlagen');
  return result.body.items;
}

/**
 * Debounced content search over the caller's office content (docs, boards,
 * sheets, presentations) — surfaces documents whose match lives in the body,
 * which the composer's local title filter can't see.
 *
 * Returns hits only once the debounce has settled on the *current* input and no
 * `keepPreviousData`, so a fast retype never leaves a stale doc selectable under
 * the new query.
 */
export function useComposerOfficeSearch(input: string, enabled = true): OfficeSearchItem[] {
  const trimmed = input.trim();
  const debounced = useDebounce(trimmed, DEBOUNCE_MS);
  const settled = debounced === trimmed;
  const active = enabled && settled && debounced.length >= MIN_OFFICE_QUERY_LENGTH;

  const { data } = useQuery({
    queryKey: ['composer-office-search', debounced],
    queryFn: () => fetchOfficeSearch(debounced),
    enabled: active,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return active ? (data ?? []) : [];
}
