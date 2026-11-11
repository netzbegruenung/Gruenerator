import { type QdrantFilter } from '../../../database/services/QdrantService/types.js';

import { type FieldFilters } from './types.js';

/**
 * Den Qdrant-Filter, den `buildSubcategoryFilter` + `applyDefaultFilter` bauen,
 * zurück in flache Feldfilter übersetzen — für Türen, die nur den fertigen
 * Filter in der Hand haben (die Suche).
 *
 * Erlaubt ist genau diese Teilmenge: `must` mit `match.value`, `match.any` und
 * `range` auf `published_at`. Alles andere wirft: eine still verworfene
 * Bedingung machte die Suche breiter, ohne dass es jemand merkt.
 */
export function fieldFiltersFromQdrant(filter: QdrantFilter | null | undefined): FieldFilters {
  const result: FieldFilters = { match: {} };
  if (!filter) return result;
  if (filter.should?.length || filter.must_not?.length) {
    throw new Error('Remote-Quelle: nur `must`-Filter werden unterstützt');
  }
  for (const condition of filter.must ?? []) {
    const c = condition as {
      key?: string;
      match?: { value?: unknown; any?: unknown[] };
      range?: { gte?: unknown; lte?: unknown };
    };
    if (typeof c.key !== 'string') {
      throw new Error(
        `Remote-Quelle: Filterbedingung nicht unterstützt: ${JSON.stringify(condition)}`
      );
    }
    if (c.key === 'published_at' && c.range) {
      result.published_at = {
        ...(typeof c.range.gte === 'string' && { gte: c.range.gte }),
        ...(typeof c.range.lte === 'string' && { lte: c.range.lte }),
      };
      continue;
    }
    const values =
      c.match?.value !== undefined
        ? [c.match.value]
        : Array.isArray(c.match?.any)
          ? c.match.any
          : null;
    if (!values) {
      throw new Error(
        `Remote-Quelle: Filterbedingung nicht unterstützt: ${JSON.stringify(condition)}`
      );
    }
    const prior = result.match[c.key] ?? [];
    // Zweimal dasselbe Feld (Default-Filter + Nutzerfilter) heisst in `must` UND.
    // Die Schnittmenge hält das ein, ohne dass jeder Adapter es selbst können muss.
    const next = values.map(String);
    result.match[c.key] = prior.length ? prior.filter((v) => next.includes(v)) : next;
  }
  return result;
}
