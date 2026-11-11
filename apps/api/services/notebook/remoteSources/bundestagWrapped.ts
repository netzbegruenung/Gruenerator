import { z } from 'zod';

import { env } from '../../../config/env.js';

import { createRemoteHttpClient } from './http.js';
import {
  type FacetCount,
  type FieldFilters,
  type RemoteChunk,
  type RemoteHit,
  type RemoteNotebookSource,
} from './types.js';

/**
 * Bundestag Wrapped (`mcp.bundestag-wrapped.de`, Movm/Bundestag_Wrapped#227):
 * Reden aus Plenarprotokollen und Drucksachen der 21. Wahlperiode.
 *
 * Wire-Vertrag v1. `doc_id` ist die ZITIERBARE Einheit — eine Rede bzw. eine
 * Drucksache, nie ein ganzes Plenarprotokoll —, und `chunk_index` zählt
 * innerhalb dieser Einheit. Sonst fielen alle Treffer einer Sitzung zu einer
 * Quelle zusammen (unser eigener Scraper trennte Reden aus genau dem Grund).
 * `party` trägt Kurznamen (`GRÜNE`), bei Drucksachen die einbringenden
 * Fraktionen.
 */

type Source = 'speeches' | 'documents';

const CONTENT_TYPE_BY_SOURCE: Record<Source, 'rede' | 'drucksache'> = {
  speeches: 'rede',
  documents: 'drucksache',
};
const SOURCE_BY_CONTENT_TYPE: Record<string, Source> = {
  rede: 'speeches',
  drucksache: 'documents',
};

/** Unsere Feldnamen → Filterfelder der API. `content_type` geht als `sources`. */
const FILTER_FIELDS: Record<string, string> = {
  party: 'party',
  wahlperiode: 'wahlperiode',
  speaker: 'speaker',
  drucksachetyp: 'drucksachetyp',
  urheber: 'urheber',
  section_type: 'section_type',
};
const NUMERIC_FILTER_FIELDS = new Set(['wahlperiode']);

const chunkSchema = z.object({
  id: z.string(),
  source: z.enum(['speeches', 'documents']),
  doc_id: z.string(),
  chunk_index: z.number().int(),
  title: z.string(),
  url: z.string().nullable(),
  date: z.string().nullable(),
  wahlperiode: z.number().int().nullable(),
  dokumentnummer: z.string().nullable(),
  speaker: z.string().nullable(),
  party: z.array(z.string()),
  drucksachetyp: z.string().nullable(),
  urheber: z.array(z.string()),
  section_type: z.string().nullable(),
  text: z.string(),
});
type WireChunk = z.infer<typeof chunkSchema>;

const searchResponseSchema = z.object({
  results: z.array(
    chunkSchema.extend({
      score: z.number(),
      // Bestes Fenster (≤ 1800 Zeichen) aus einem bis zu 4000 Zeichen langen
      // Chunk; ohne kürzt unser Prompt eine lange Rede auf ihren Anfang.
      excerpt: z.string().nullable(),
    })
  ),
});
const chunksResponseSchema = z.object({ chunks: z.array(chunkSchema) });
const facetsResponseSchema = z.object({
  values: z.array(z.object({ value: z.union([z.string(), z.number()]), count: z.number() })),
});

const http = createRemoteHttpClient({
  id: 'bundestag-wrapped',
  label: 'Bundestag-Quelle',
  credentials: () => ({
    baseUrl: env.BUNDESTAG_NOTEBOOK_API_URL,
    apiKey: env.BUNDESTAG_NOTEBOOK_API_KEY,
  }),
});

interface WireFilters {
  sources?: Source[];
  filters: Record<string, Array<string | number>> & { from?: string; to?: string };
}

/** `null` = die Filter schliessen sich aus, es gibt nichts zu fragen. */
function toWireFilters(filters: FieldFilters): WireFilters | null {
  const wire: WireFilters = { filters: {} };
  for (const [field, values] of Object.entries(filters.match)) {
    if (values.length === 0) return null;
    if (field === 'content_type') {
      const sources = values.map((v) => SOURCE_BY_CONTENT_TYPE[v]).filter((s) => s !== undefined);
      if (sources.length === 0) return null;
      wire.sources = sources;
      continue;
    }
    const wireField = FILTER_FIELDS[field];
    if (!wireField) throw new Error(`[bundestag-wrapped] Filter "${field}" wird nicht unterstützt`);
    wire.filters[wireField] = NUMERIC_FILTER_FIELDS.has(field) ? values.map(Number) : [...values];
  }
  if (filters.published_at?.gte) wire.filters.from = filters.published_at.gte.slice(0, 10);
  if (filters.published_at?.lte) wire.filters.to = filters.published_at.lte.slice(0, 10);
  return wire;
}

function documentIdOf(chunk: Pick<WireChunk, 'source' | 'doc_id'>): string {
  return `${CONTENT_TYPE_BY_SOURCE[chunk.source]}:${chunk.doc_id}`;
}

function parseDocumentId(documentId: string): { source: Source; doc_id: string } | null {
  const [contentType, ...rest] = documentId.split(':');
  const source = contentType ? SOURCE_BY_CONTENT_TYPE[contentType] : undefined;
  return source && rest.length > 0 ? { source, doc_id: rest.join(':') } : null;
}

function toPayload(chunk: WireChunk, chunkText: string): Record<string, unknown> {
  // Reden teilen sich die PDF-URL ihres Protokolls; der Anker hält sie in
  // URL-Deduplizierung und Zitaten auseinander.
  const sourceUrl =
    chunk.url && chunk.source === 'speeches' ? `${chunk.url}#rede-${chunk.doc_id}` : chunk.url;
  return {
    document_id: documentIdOf(chunk),
    content_type: CONTENT_TYPE_BY_SOURCE[chunk.source],
    title: chunk.title,
    source_url: sourceUrl,
    published_at: chunk.date,
    wahlperiode: chunk.wahlperiode != null ? String(chunk.wahlperiode) : null,
    dokumentnummer: chunk.dokumentnummer,
    party: chunk.party,
    speaker: chunk.speaker,
    drucksachetyp: chunk.drucksachetyp,
    urheber: chunk.urheber,
    section_type: chunk.section_type,
    chunk_index: chunk.chunk_index,
    chunk_text: chunkText,
    source: 'bundestag-wrapped',
  };
}

export const bundestagWrappedSource: RemoteNotebookSource = {
  id: 'bundestag-wrapped',
  label: 'Bundestag-Quelle',

  async search({ vector, query, filters, limit, threshold }): Promise<RemoteHit[]> {
    const wire = toWireFilters(filters);
    if (!wire) return [];
    const { results } = await http.post(
      '/api/v1/search',
      { vector, query, limit, ...(threshold != null && { scoreThreshold: threshold }), ...wire },
      searchResponseSchema
    );
    return results.map((hit) => ({
      id: hit.id,
      score: hit.score,
      payload: toPayload(hit, hit.excerpt ?? hit.text),
    }));
  },

  async facetCounts(field, filters, limit): Promise<FacetCount[]> {
    const wire = toWireFilters(filters);
    if (!wire) return [];
    const wireField = field === 'content_type' ? 'source' : FILTER_FIELDS[field];
    if (!wireField)
      throw new Error(`[bundestag-wrapped] Facette "${field}" wird nicht unterstützt`);
    const { values } = await http.post(
      '/api/v1/facets',
      { field: wireField, limit, ...wire },
      facetsResponseSchema
    );
    return values.map(({ value, count }) => ({
      value:
        field === 'content_type'
          ? (CONTENT_TYPE_BY_SOURCE[value as Source] ?? String(value))
          : String(value),
      count,
    }));
  },

  async chunks(documentId, chunkIndexes): Promise<RemoteChunk[]> {
    const ref = parseDocumentId(documentId);
    if (!ref || chunkIndexes.length === 0) return [];
    const { chunks } = await http.post(
      '/api/v1/chunks',
      { ...ref, chunk_indexes: [...chunkIndexes] },
      chunksResponseSchema
    );
    return chunks
      .map((chunk) => ({ id: chunk.id, payload: toPayload(chunk, chunk.text) }))
      .sort((a, b) => (a.payload.chunk_index as number) - (b.payload.chunk_index as number));
  },
};

export const resetBundestagWrappedBreakerForTests = (): void => http.resetBreakerForTests();
