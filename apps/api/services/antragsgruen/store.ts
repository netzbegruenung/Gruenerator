/**
 * Der Antragsgrün-Bestand im Index: Anträge, Änderungsanträge und Beschlüsse,
 * die der `ParteitageScraper` nach `landesverbaende_documents` schreibt
 * (`source_id` je Instanz). Jeder Chunk trägt die Dokumentfelder, Chunk 0
 * zusätzlich `full_text` — Liste, Zählung und Lesen kommen ohne Antragsgrün aus.
 *
 * Gezählt wird immer über Chunk 0: eine Facette zählt Punkte, nicht Dokumente.
 */
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';
import { PARTEITAGE_COLLECTION } from '../scrapers/implementations/ParteitageScraper/builders.js';

import type { QdrantClient, Schemas } from '@qdrant/js-client-rest';

export type AgFilter = Schemas['Filter'];
export type AgCondition = Schemas['Condition'];
export type AgPayload = Record<string, unknown>;

/** Was eine Listenzeile braucht; nie `full_text`. */
const LIST_FIELDS = [
  'document_id',
  'title',
  'content_type',
  'parteitag',
  'parteitag_id',
  'kuerzel',
  'status',
  'votum',
  'antragsteller',
  'tagesordnungspunkt',
  'antrag_id',
  'antrag_kuerzel',
  'antrag_titel',
  'beschluss_id',
  'neueste_fassung_id',
  'eingereicht_am',
  'beschlossen_am',
  'beschlussdatum_quelle',
  'beschluss_durch',
  'source_url',
  'published_at',
];

export const HEAD: AgCondition = { key: 'chunk_index', match: { value: 0 } };

export interface FacetHit {
  value: string;
  count: number;
}

/** Der Zugriff auf den Index; in Tests durch eine Attrappe ersetzt. */
export interface AntragsgruenIndex {
  /** Dichte Suche über die Chunks, beste zuerst; jede Zeile trägt `chunk_text`. */
  nearest(query: string, filter: AgFilter, limit: number): Promise<AgPayload[]>;
  /** Chunk 0 der passenden Dokumente, neueste zuerst. */
  latest(filter: AgFilter, limit: number): Promise<AgPayload[]>;
  /** Exakte Zählung je Wert (über Chunk 0, also je Dokument). */
  facet(key: string, filter: AgFilter, limit: number): Promise<FacetHit[]>;
  /** Exakte Zahl der Dokumente. */
  count(filter: AgFilter): Promise<number>;
  /** Chunk 0 dieser Dokumente samt `full_text`. */
  heads(documentIds: readonly string[]): Promise<AgPayload[]>;
  /** Alle `document_id`s eines Parteitags (für den Live-Abgleich). */
  documentIds(filter: AgFilter): Promise<string[]>;
}

const withHead = (filter: AgFilter): AgFilter => ({
  ...filter,
  must: [...((filter.must as AgCondition[] | undefined) ?? []), HEAD],
});

function qdrantIndex(clientOf: () => Promise<QdrantClient>): AntragsgruenIndex {
  const payloads = (points: Array<{ payload?: AgPayload | null }>) =>
    points.map((p) => p.payload ?? {});
  return {
    async nearest(query, filter, limit) {
      const client = await clientOf();
      const vector = await mistralEmbeddingService.generateQueryEmbedding(query);
      const res = await client.query(PARTEITAGE_COLLECTION, {
        query: vector,
        filter,
        limit,
        with_payload: [...LIST_FIELDS, 'chunk_text', 'chunk_index'],
        with_vector: false,
      });
      return payloads(res.points);
    },
    async latest(filter, limit) {
      const client = await clientOf();
      const page = await client.scroll(PARTEITAGE_COLLECTION, {
        filter: withHead(filter),
        limit,
        with_payload: LIST_FIELDS,
        with_vector: false,
        order_by: { key: 'published_at', direction: 'desc' },
      });
      return payloads(page.points);
    },
    async facet(key, filter, limit) {
      const client = await clientOf();
      const res = await client.facet(PARTEITAGE_COLLECTION, {
        key,
        filter: withHead(filter),
        limit,
        exact: true,
      });
      return res.hits.map((h) => ({ value: String(h.value), count: h.count }));
    },
    async count(filter) {
      const client = await clientOf();
      return (await client.count(PARTEITAGE_COLLECTION, { filter: withHead(filter), exact: true }))
        .count;
    },
    async heads(documentIds) {
      if (documentIds.length === 0) return [];
      const client = await clientOf();
      const page = await client.scroll(PARTEITAGE_COLLECTION, {
        filter: { must: [HEAD, { key: 'document_id', match: { any: [...documentIds] } }] },
        limit: documentIds.length,
        with_payload: [...LIST_FIELDS, 'full_text'],
        with_vector: false,
      });
      return payloads(page.points);
    },
    async documentIds(filter) {
      const client = await clientOf();
      const ids: string[] = [];
      let offset: Schemas['ExtendedPointId'] | null | undefined = undefined;
      do {
        const page = await client.scroll(PARTEITAGE_COLLECTION, {
          filter: withHead(filter),
          limit: 1000,
          with_payload: ['document_id'],
          with_vector: false,
          ...(offset != null ? { offset } : {}),
        });
        for (const p of page.points) {
          const id = p.payload?.document_id;
          if (typeof id === 'string') ids.push(id);
        }
        offset = page.next_page_offset as Schemas['ExtendedPointId'] | null | undefined;
      } while (offset != null);
      return ids;
    },
  };
}

export function getAntragsgruenIndex(): AntragsgruenIndex {
  // Je Aufruf neu verbunden, wie `getNrwNotebook`: ein einmal geholter Client
  // überlebt einen Qdrant-Ausfall nicht.
  return qdrantIndex(async () => {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    return qdrant.readClient(PARTEITAGE_COLLECTION);
  });
}
