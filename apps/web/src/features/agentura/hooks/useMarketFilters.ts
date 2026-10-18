import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  AGENTURA_TYPE_VALUES,
  DEFAULT_TYPE,
  SORT_VALUES,
  type AgenturaSort,
  type AgenturaType,
} from '../lib/categories';

/** Herkunft im Shop — die Gänge der Agentura. */
export const SHOP_ORIGINS = ['offiziell', 'landesverband', 'oeffentlich'] as const;
export type ShopOrigin = (typeof SHOP_ORIGINS)[number];

// Moved to @gruenerator/shared/marketplace so web and mobile map old links alike.
export {
  AGENTURA_PATH,
  GRUENERATOREN_PATH,
  legacyAgenturaRedirect,
} from '@gruenerator/shared/marketplace';

export interface MarketParams<O extends string> {
  search: string;
  type: AgenturaType;
  sort: AgenturaSort;
  /** `null` = alle Herkünfte (oder die Seite kennt keine). */
  origin: O | null;
}

const DEFAULT_SORT: AgenturaSort = 'empfohlen';

export function parseMarketParams<O extends string>(
  params: URLSearchParams,
  origins: readonly O[]
): MarketParams<O> {
  const typeParam = params.get('type') as AgenturaType | null;
  const sortParam = params.get('sort') as AgenturaSort | null;
  const originParam = params.get('von') as O | null;
  return {
    search: params.get('q') ?? '',
    type: typeParam && AGENTURA_TYPE_VALUES.includes(typeParam) ? typeParam : DEFAULT_TYPE,
    sort: sortParam && SORT_VALUES.includes(sortParam) ? sortParam : DEFAULT_SORT,
    origin: originParam && origins.includes(originParam) ? originParam : null,
  };
}

export interface MarketFilters<O extends string> extends MarketParams<O> {
  setSearch: (value: string) => void;
  setType: (value: AgenturaType) => void;
  setSort: (value: AgenturaSort) => void;
  setOrigin: (value: O | null) => void;
  reset: () => void;
  /** Alles, was enger ist als „alles, empfohlen sortiert". */
  isFiltered: boolean;
}

const NO_ORIGINS: readonly never[] = [];

/** Suche, Art, Herkunft und Sortierung — alles in der Adresse, ein geteilter Link zeigt dieselbe Ansicht. */
export function useMarketFilters<O extends string = never>(
  origins: readonly O[] = NO_ORIGINS
): MarketFilters<O> {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseMarketParams(params, origins), [params, origins]);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const setSearch = useCallback((value: string) => setParam('q', value), [setParam]);
  const setType = useCallback(
    (value: AgenturaType) => setParam('type', value === DEFAULT_TYPE ? null : value),
    [setParam]
  );
  const setSort = useCallback(
    (value: AgenturaSort) => setParam('sort', value === DEFAULT_SORT ? null : value),
    [setParam]
  );
  const setOrigin = useCallback((value: O | null) => setParam('von', value), [setParam]);
  const reset = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of ['q', 'type', 'sort', 'von']) next.delete(key);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  return {
    ...parsed,
    setSearch,
    setType,
    setSort,
    setOrigin,
    reset,
    isFiltered:
      parsed.search.trim() !== '' ||
      parsed.type !== DEFAULT_TYPE ||
      parsed.sort !== DEFAULT_SORT ||
      parsed.origin !== null,
  };
}
