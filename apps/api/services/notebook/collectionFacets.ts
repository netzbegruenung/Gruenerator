import {
  applyDefaultFilter,
  getFacetCountFilter,
  isRemoteCollection,
  type SystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import {
  type DateRange,
  type FieldValueCount,
} from '../../database/services/QdrantService/types.js';

import { fieldFiltersFromQdrant } from './remoteSources/filters.js';
import { getRemoteSource } from './remoteSources/registry.js';

/**
 * Facetten einer System-Sammlung — die eine Tür für alle Filter-Endpunkte
 * (Notebook-Chat, Recherche, Landesverbands-API). Qdrant oder Remote-Quelle
 * entscheidet sich hier, nicht in jedem Endpunkt. Gezählt wird je Dokument,
 * nicht je Chunk; der Standardfilter der Sammlung gilt immer.
 *
 * Wirft bei einem Ausfall — die Aufrufer setzen dann `complete = false` und
 * cachen das Ergebnis nicht.
 */
export async function facetValueCounts(
  config: SystemCollectionConfig,
  field: string,
  limit = 50
): Promise<FieldValueCount[]> {
  if (isRemoteCollection(config)) {
    const filters = fieldFiltersFromQdrant(applyDefaultFilter(config.id));
    return await getRemoteSource(config.remote).facetCounts(field, filters, limit);
  }
  const qdrant = getQdrantInstance();
  await qdrant.init();
  return await qdrant.getFieldValueCounts(
    config.qdrantCollection,
    field,
    limit,
    getFacetCountFilter(config.id)
  );
}

export async function facetDateRange(
  config: SystemCollectionConfig,
  field: string
): Promise<DateRange> {
  // Remote-Quellen kennen (noch) keine Datumsgrenzen; der Filter bleibt
  // benutzbar, nur ohne vorbelegtes Min/Max.
  if (isRemoteCollection(config)) return { min: null, max: null };
  const qdrant = getQdrantInstance();
  await qdrant.init();
  return await qdrant.getDateRange(
    config.qdrantCollection,
    field,
    (applyDefaultFilter(config.id) as Record<string, unknown> | undefined) ?? null
  );
}
