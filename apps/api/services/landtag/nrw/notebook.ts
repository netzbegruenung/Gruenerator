/**
 * Der Landtag NRW hat keine Abfrage-API: `landtag` und `parlament_lesen` lesen
 * das Notebook (`landtag_nrw_documents`, gefüllt vom `LandtagNrwScraper`). Jeder
 * Chunk trägt die Dokumentfelder (Nummer, Art, Urheber, Datum), Chunk 0
 * zusätzlich `full_text` — Liste, Filter und Lesen kommen also ohne PDF aus.
 *
 * Refs: `NW 18/21508` = Drucksache 18/21508. Das Werkzeug führt nur
 * Drucksachen; Protokolle liegen dort je Tagesordnungspunkt und teilen ihre
 * Nummer, sie bleiben bei `gruenerator_search`.
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import {
  LANDTAG_NRW_COLLECTION,
  WAHLPERIODE,
} from '../../scrapers/implementations/LandtagNrwScraper/builders.js';

import type { QdrantClient, Schemas } from '@qdrant/js-client-rest';

export { WAHLPERIODE as NRW_WAHLPERIODE };

export type NrwFilter = Schemas['Filter'];
export type NrwCondition = Schemas['Condition'];
export type NrwPayload = Record<string, unknown>;

export const NRW_REF_RE = /^NW (\d{1,2})\/(\d{1,6})$/;

/** Was eine Listenzeile braucht; nie `full_text` oder `chunk_text`. */
const LIST_FIELDS = [
  'document_id',
  'document_number',
  'doc_type',
  'title',
  'published_at',
  'party',
  'source_url',
  'keywords',
  'vorgang_id',
  'indexed_at',
];

/** Der Zugriff auf das Notebook; in Tests durch eine Attrappe ersetzt. */
export interface NrwNotebook {
  /** Neueste zuerst (Punkte ohne `published_at` fallen bei `order_by` weg). */
  latest(filter: NrwFilter, limit: number): Promise<NrwPayload[]>;
  /** Dichte Suche über die Chunks, beste zuerst. */
  nearest(query: string, filter: NrwFilter, limit: number): Promise<NrwPayload[]>;
  count(filter: NrwFilter): Promise<number>;
  /** Text eines Dokuments: `full_text` von Chunk 0, sonst die Chunks in Reihenfolge. */
  text(documentId: string): Promise<string>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];

export function nrwRef(documentNumber: string): string {
  return `NW ${documentNumber}`;
}

export function toNrwCandidate(p: NrwPayload): BundestagCandidate | null {
  const nummer = str(p.document_number);
  const id = str(p.document_id);
  if (!NRW_REF_RE.test(nrwRef(nummer)) || !id) return null;
  const keywords = strs(p.keywords);
  return {
    ref: nrwRef(nummer),
    dipId: id,
    kind: 'drucksache',
    dokumentnummer: nummer,
    drucksachetyp: str(p.doc_type),
    titel: str(p.title).trim(),
    datum: str(p.published_at).slice(0, 10),
    urheber: strs(p.party),
    pdfUrl: str(p.source_url) || null,
    vorgangId: str(p.vorgang_id) || null,
    vorgangTitel: null,
    abstract: keywords.length > 0 ? keywords.join(', ') : null,
    aktualisiert: str(p.indexed_at) || null,
    beratung: null,
  };
}

/** Pro Ref der erste Treffer; die Reihenfolge der Eingabe bleibt. */
export function dedupeNrw(payloads: readonly NrwPayload[]): BundestagCandidate[] {
  const byRef = new Map<string, BundestagCandidate>();
  for (const p of payloads) {
    const c = toNrwCandidate(p);
    if (c && !byRef.has(c.ref)) byRef.set(c.ref, c);
  }
  return [...byRef.values()];
}

function qdrantNotebook(clientOf: () => Promise<QdrantClient>): NrwNotebook {
  const payloads = (points: Array<{ payload?: NrwPayload | null }>) =>
    points.map((p) => p.payload ?? {});
  return {
    async latest(filter, limit) {
      const client = await clientOf();
      const page = await client.scroll(LANDTAG_NRW_COLLECTION, {
        filter,
        limit,
        with_payload: LIST_FIELDS,
        with_vector: false,
        order_by: { key: 'published_at', direction: 'desc' },
      });
      return payloads(page.points);
    },
    async nearest(query, filter, limit) {
      const client = await clientOf();
      const vector = await mistralEmbeddingService.generateQueryEmbedding(query);
      const res = await client.query(LANDTAG_NRW_COLLECTION, {
        query: vector,
        filter,
        limit,
        with_payload: LIST_FIELDS,
        with_vector: false,
      });
      return payloads(res.points);
    },
    async count(filter) {
      const client = await clientOf();
      return (await client.count(LANDTAG_NRW_COLLECTION, { filter, exact: true })).count;
    },
    async text(documentId) {
      const client = await clientOf();
      const byDoc = { key: 'document_id', match: { value: documentId } };
      const head = await client.scroll(LANDTAG_NRW_COLLECTION, {
        filter: { must: [byDoc, { key: 'chunk_index', match: { value: 0 } }] },
        limit: 1,
        with_payload: ['full_text'],
        with_vector: false,
      });
      const full = str(head.points[0]?.payload?.full_text);
      if (full) return full;
      // Über 400.000 Zeichen trägt Chunk 0 keinen `full_text` (`parliamentStore.ts`);
      // die Chunks überlappen, der Text wird also etwas länger als das Original.
      const chunks: Array<{ i: number; text: string }> = [];
      let offset: Schemas['ExtendedPointId'] | null | undefined = undefined;
      do {
        const page = await client.scroll(LANDTAG_NRW_COLLECTION, {
          filter: { must: [byDoc] },
          limit: 256,
          with_payload: ['chunk_index', 'chunk_text'],
          with_vector: false,
          ...(offset != null ? { offset } : {}),
        });
        for (const p of page.points) {
          chunks.push({ i: Number(p.payload?.chunk_index ?? 0), text: str(p.payload?.chunk_text) });
        }
        offset = page.next_page_offset as Schemas['ExtendedPointId'] | null | undefined;
      } while (offset != null);
      return chunks
        .sort((a, b) => a.i - b.i)
        .map((c) => c.text)
        .join('\n\n');
    },
  };
}

export function getNrwNotebook(): NrwNotebook {
  // Je Aufruf: `init()` ist idempotent und verbindet neu, wenn der Dienst den
  // Client nach einem Ausfall verworfen hat — ein einmal geholter Client warf
  // dann „Qdrant is not available" (live 04.11.2026, 2 von 8 NRW-Turns).
  return qdrantNotebook(async () => {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    return qdrant.readClient(LANDTAG_NRW_COLLECTION);
  });
}
