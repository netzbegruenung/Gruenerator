/**
 * Die Landesverbands-Notizbücher haben ab jetzt zwei Türen: die REST-API
 * `/api/v1/notebooks*` für Partner-Integrationen und die MCP-Werkzeuge
 * `notebooks_*` für Modell-Clients. Beide entscheiden dieselben drei Fragen —
 * darf dieser Schlüssel diesen Landesverband, welche Sammlung ist gemeint,
 * welche Filterwerte gibt es — und beantworten sie hier gemeinsam.
 *
 * Der MCP-Server hat die Fragen bis v1 gar nicht selbst beantwortet: dort war
 * jedes Werkzeug ein HTTP-Aufruf zurück auf diese REST-Route. In-Process
 * entfällt der Umweg, die Antwort muss aber dieselbe bleiben.
 */
import {
  getCollectionDefaultFilter,
  getCollectionFilterableFields,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { assertLandesverbandScope } from '../../middleware/apiKeyMiddleware.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { createLogger } from '../../utils/logger.js';

import {
  getSystemCollectionIdForLandesverband,
  listSupportedLandesverbaende,
} from './landesverbandMap.js';

const log = createLogger('v1.landesverbandNotebooks');

export type LandesverbandScope = string[] | '*' | undefined;

export interface LandesverbandEntry {
  code: string;
  collectionId: string;
  name: string;
}

/** Die Landesverbände, die dieser Schlüssel abfragen darf. */
export function listAllowedLandesverbaende(allowed: LandesverbandScope): LandesverbandEntry[] {
  const all = listSupportedLandesverbaende();
  if (allowed === '*') return all;
  const codes = allowed ?? [];
  return all.filter((lv) => codes.includes(lv.code));
}

export type LandesverbandResolution =
  { ok: true; collectionId: string } | { ok: false; status: 403 | 404; reason: string };

/**
 * Berechtigung und Sammlungs-Auflösung in einem Schritt — die beiden Prüfungen
 * standen an jeder der drei REST-Routen wortgleich untereinander.
 */
export function resolveLandesverband(
  allowed: LandesverbandScope,
  requested: string
): LandesverbandResolution {
  const auth = assertLandesverbandScope(allowed, requested);
  if (!auth.ok) return { ok: false, status: 403, reason: auth.reason };

  const collectionId = getSystemCollectionIdForLandesverband(requested);
  if (!collectionId) {
    return { ok: false, status: 404, reason: `Unbekannter Landesverband: ${requested}` };
  }
  return { ok: true, collectionId };
}

export interface LandesverbandChunk {
  documentId: string;
  title: string;
  url: string | null;
  excerpt: string;
  similarity: number;
  date: string | null;
}

/**
 * Die Belegstellen zu einer Frage — ohne Modellaufruf.
 *
 * `askSingleCollection` wäre der falsche Weg: mit `fastMode` verlässt es die
 * Funktion mit `citations: []` und `sources: []` (der Zweig überspringt die
 * Zitatverarbeitung vollständig), ohne `fastMode` schreibt es eine Antwort, die
 * hier niemand braucht. `getSearchContext` ist genau die Abrufhälfte davon.
 */
export async function searchLandesverbandChunks(params: {
  collectionId: string;
  query: string;
  userId?: string;
  filters?: Record<string, unknown>;
  limit?: number;
}): Promise<LandesverbandChunk[]> {
  const context = await notebookQAService.getSearchContext({
    question: params.query,
    collectionId: params.collectionId,
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.filters ? { requestFilters: params.filters } : {}),
  });
  if (!context) return [];

  const results = params.limit
    ? context.sortedResults.slice(0, params.limit)
    : context.sortedResults;
  return results.map((r) => ({
    documentId: r.document_id,
    title: r.title,
    url: r.source_url,
    excerpt: r.snippet,
    similarity: r.similarity,
    date: r.date ?? r.published_at ?? null,
  }));
}

export interface LandesverbandFilterField {
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  min?: string | null;
  max?: string | null;
}

/**
 * Facettenwerte einer LV-Sammlung.
 *
 * Der `defaultFilter` der Sammlung muss mit in die Abfrage: alle LV-Sammlungen
 * liegen in derselben Qdrant-Collection und unterscheiden sich nur über
 * `landesverband`. Ohne ihn zählte die Facette über alle Landesverbände.
 */
export async function loadLandesverbandFilters(
  collectionId: string
): Promise<Record<string, LandesverbandFilterField>> {
  const systemConfig = getSystemCollectionConfig(collectionId);
  if (!systemConfig) return {};

  const filterableFields = getCollectionFilterableFields(collectionId);
  const defaultFilter = getCollectionDefaultFilter(collectionId);
  const baseFilter = defaultFilter
    ? {
        must: [
          {
            key: defaultFilter.field,
            match: Array.isArray(defaultFilter.value)
              ? { any: defaultFilter.value }
              : { value: defaultFilter.value },
          },
        ],
      }
    : null;

  const qdrant = getQdrantInstance();
  await qdrant.init();

  const filters: Record<string, LandesverbandFilterField> = {};
  for (const field of filterableFields) {
    try {
      if (field.type === 'date_range') {
        const { min, max } = await qdrant.getDateRange(
          systemConfig.qdrantCollection,
          field.field,
          baseFilter
        );
        filters[field.field] = { label: field.label, type: field.type, min, max };
      } else {
        const values = await qdrant.getFieldValueCounts(
          systemConfig.qdrantCollection,
          field.field,
          50,
          baseFilter
        );
        filters[field.field] = { label: field.label, type: field.type, values };
      }
    } catch (e) {
      // Ein Feld ohne Index darf die übrigen Facetten nicht mitnehmen.
      log.warn(`[landesverbandFilters] Feld ${field.field} fehlgeschlagen:`, e);
    }
  }
  return filters;
}
