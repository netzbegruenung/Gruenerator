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

export const GRUENERATOREN_PATH = '/grueneratoren';
export const AGENTURA_PATH = '/agentura';

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

/** Die alten Regale (`?cat=`) und wohin sie heute gehören. */
const LEGACY_SHELVES: Record<string, ShopOrigin | 'uebersicht'> = {
  meine: 'uebersicht',
  favoriten: 'uebersicht',
  landesverband: 'landesverband',
  gruenerator: 'offiziell',
  community: 'oeffentlich',
};

/**
 * Bis Oktober 2026 war `/agentura` die Übersicht über alles, und Links aus
 * Chat-Antworten, Einstellungen und Lesezeichen tragen das weiter. Ein Link,
 * der die Übersicht meinte, führt deshalb auf `/grueneratoren`; ein Regal, das
 * heute ein Gang im Shop ist, wird zu `?von=`. `null` = der Link meint den Shop.
 */
export function legacyAgenturaRedirect(params: URLSearchParams): string | null {
  const cat = params.get('cat');
  const target = cat ? (LEGACY_SHELVES[cat] ?? null) : null;
  // Wiederkehrende Aufgaben gibt es nur auf der Übersicht.
  const toOverview = target === 'uebersicht' || params.get('type') === 'task';
  if (!cat && !toOverview) return null;

  const next = new URLSearchParams(params);
  next.delete('cat');
  if (toOverview) {
    next.delete('von');
    // Das alte Favoriten-Regal ist heute der Favoriten-Filter der Übersicht.
    if (cat === 'favoriten') next.set('type', 'fav');
    const query = next.toString();
    return query ? `${GRUENERATOREN_PATH}?${query}` : GRUENERATOREN_PATH;
  }
  if (target) next.set('von', target);
  const query = next.toString();
  return query ? `${AGENTURA_PATH}?${query}` : AGENTURA_PATH;
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
