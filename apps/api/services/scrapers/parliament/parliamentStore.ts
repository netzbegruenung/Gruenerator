/**
 * Schreibt Parlamentsdokumente in ihre Qdrant-Sammlung: zerlegen, einbetten,
 * Chunks schreiben — Chunk 0 zuletzt und allein. Er ist das „fertig"-Zeichen:
 * „schon da" heißt, Chunk 0 liegt in Qdrant, und ein abgebrochener Upsert
 * hinterlässt nie ein Dokument, das als fertig gilt.
 */

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import {
  batchDelete,
  batchUpsert,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { generatePointId } from '../../../utils/validation/index.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  buildEmbeddingTextsForChunks,
  embeddingPayload,
  offsetPayload,
  smartChunkDocument,
  structurePayload,
} from '../../document-services/index.js';
import { pagePayload } from '../../document-services/pagePayload.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { recordSyncEvent, toExcerpt } from '../syncEventRecorder.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

const UPSERT_BATCH = 10;
/**
 * `full_text` nur bis zu dieser Länge: der Qdrant-Proxy lehnt größere Bodies mit
 * 413 ab (gemessen am 393-seitigen Abschlussbericht der Enquetekommission
 * „Wasser" im Landtag NRW). Ohne `full_text` setzt der Quellen-Leser den Text
 * aus den Chunks zusammen (`systemNotebookSources.ts`), es geht also nichts verloren.
 */
const FULL_TEXT_MAX_CHARS = 400_000;

export interface ParliamentDocument {
  documentId: string;
  title: string;
  sourceUrl: string;
  /** Kopf und PDF-Text, strukturerhaltend (siehe CLAUDE.md, „full_text und chunk_text"). */
  text: string;
  /** Felder, die jeder Chunk trägt. */
  payload: Record<string, unknown>;
  extraction: { method: string; pageCount: number };
  /** Für den Sync-Bericht. */
  excerpt: string;
  publishedAt: string | null;
}

type SyncSource = Parameters<typeof recordSyncEvent>[0]['sourceGroupId'];

export class ParliamentStore {
  #client: QdrantClient | null = null;

  constructor(
    private readonly collection: string,
    private readonly source: SyncSource,
    private readonly sourceName: string
  ) {}

  /**
   * Erst beim ersten echten Zugriff: ein Probelauf soll Qdrant nicht berühren —
   * `init()` legte dort sonst schon die Collection an.
   */
  async client(): Promise<QdrantClient> {
    if (!this.#client) {
      const qdrant = getQdrantInstance();
      await qdrant.init(); // legt die Collection aus COLLECTION_SCHEMAS an, falls sie fehlt
      this.#client = qdrant.client!;
    }
    return this.#client;
  }

  /** document_id aller fertigen Dokumente — fertig heißt: Chunk 0 liegt da. */
  async loadKnownIds(): Promise<Set<string>> {
    return new Set((await this.loadKnown([])).keys());
  }

  /** Wie {@link loadKnownIds}, dazu je Dokument die genannten Payload-Felder von Chunk 0. */
  async loadKnown(fields: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    const client = await this.client();
    const known = new Map<string, Record<string, unknown>>();
    let offset: string | number | null | undefined = undefined;
    do {
      const page = await client.scroll(this.collection, {
        filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
        with_payload: ['document_id', ...fields],
        with_vector: false,
        limit: 1000,
        ...(offset !== undefined && offset !== null ? { offset } : {}),
      });
      for (const p of page.points) {
        const id = p.payload?.document_id;
        if (typeof id === 'string') known.set(id, p.payload ?? {});
      }
      offset = page.next_page_offset as string | number | null | undefined;
    } while (offset !== undefined && offset !== null);
    return known;
  }

  /** Zerlegt `doc.text`; die Zahl der Chunks, ohne etwas zu schreiben. */
  async chunk(doc: Pick<ParliamentDocument, 'text' | 'title' | 'sourceUrl'>) {
    return smartChunkDocument(doc.text, {
      baseMetadata: { title: doc.title, source: this.source, source_url: doc.sourceUrl },
    });
  }

  /**
   * Schreibt ein Dokument. `replace` löscht vorher die alten Chunks — sonst
   * blieben bei einer kürzeren Neufassung Chunks der alten stehen.
   * Liefert die Zahl der geschriebenen Chunks (0 = nichts zu schreiben).
   */
  async store(doc: ParliamentDocument, replace: boolean): Promise<number> {
    const chunks = await this.chunk(doc);
    if (chunks.length === 0) return 0;

    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      buildEmbeddingTextsForChunks(chunks, doc.title)
    );
    const client = await this.client();
    if (replace) {
      await batchDelete(client, this.collection, {
        must: [{ key: 'document_id', match: { value: doc.documentId } }],
      });
    }

    const indexedAt = new Date().toISOString();
    const points = chunks.map((chunk, index) => ({
      id: generatePointId(this.source, doc.documentId, index),
      vector: embeddings[index],
      payload: {
        ...doc.payload,
        chunk_index: index,
        chunk_text: chunk.text,
        ...structurePayload(chunk),
        ...embeddingPayload(),
        ...offsetPayload(chunk),
        ...pagePayload(chunk),
        quality_score: chunkQualityService.calculateQualityScore(chunk.text),
        extraction_method: doc.extraction.method,
        page_count: doc.extraction.pageCount,
        indexed_at: indexedAt,
        ...(index === 0 && doc.text.length <= FULL_TEXT_MAX_CHARS ? { full_text: doc.text } : {}),
      },
    }));

    // Chunk 0 zuletzt und allein: er ist das „fertig"-Zeichen für den nächsten
    // Lauf und trägt mit `full_text` den größten Body.
    const rest = points.slice(1);
    for (let i = 0; i < rest.length; i += UPSERT_BATCH) {
      await batchUpsert(client, this.collection, rest.slice(i, i + UPSERT_BATCH));
    }
    await batchUpsert(client, this.collection, [points[0]]);

    recordSyncEvent({
      title: doc.title,
      sourceUrl: doc.sourceUrl,
      sourceGroupId: this.source,
      sourceName: this.sourceName,
      excerpt: toExcerpt(doc.excerpt),
      landesverband: null,
      collection: this.collection,
      eventType: replace ? 'updated' : 'stored',
      publishedAt: doc.publishedAt,
    });
    return points.length;
  }
}
