/**
 * Wie ehrlich ist ein Erwähnungs-Zähler auf der Trefferkarte?
 *
 *   pnpm --filter @gruenerator/api eval:manual:mentions
 *
 * `term_chunk_count` zählt die abgerufenen Chunks eines Dokuments, die den
 * Suchbegriff wörtlich tragen. Ob das der Zahl im Dokument entspricht, hängt am
 * Recall-Fenster: was die Suche nicht geholt hat, kann nicht mitgezählt werden.
 * Dieses Skript misst die Lücke, statt sie zu schätzen — es scrollt für jedes
 * Trefferdokument ALLE Chunks aus Qdrant und zählt dort mit **derselben**
 * Regel (`containsNormalized`), damit nur das Recall-Fenster übrig bleibt und
 * nicht ein Unterschied in der Treffer-Definition mitgemessen wird.
 *
 * Ergebnis entscheidet die Beschriftung: deckt sich der Zähler, darf die Karte
 * "N Erwähnungen" sagen; bleibt er systematisch darunter, muss dort "mind. N"
 * stehen.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

const { env } = await import('../../config/env.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../../database/services/QdrantService/connection.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { extractMultiFieldContent } =
  await import('../../database/services/QdrantService/search.js');
const { containsNormalized } = await import('../../services/text/normalization.js');
const { RETRIEVAL_CASES } = await import('./cases.js');

import type { DocumentResult } from '../../services/BaseSearchService/types.js';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;
const MANUAL_MIN_SCORE = 0.35;
/** Nur die Treffer, die auf der ersten Bildschirmseite landen. */
const DOCS_PER_CASE = 10;
const SCROLL_PAGE = 256;

interface Row {
  query: string;
  title: string;
  counted: number;
  actual: number;
}

async function trueMentionCount(
  client: ReturnType<typeof createQdrantClient>,
  collection: string,
  documentId: string,
  query: string
): Promise<number> {
  let offset: string | number | undefined;
  let hits = 0;

  for (;;) {
    const page = await client.scroll(collection, {
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
      limit: SCROLL_PAGE,
      with_payload: true,
      with_vector: false,
      ...(offset === undefined ? {} : { offset }),
    });

    for (const point of page.points) {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      // Die Chunk-Collections legen den Text unter `chunk_text` ab —
      // `extractMultiFieldContent` kennt nur die Dokument-Felder und liefert
      // hier `undefined`, was jede Zählung still auf 0 setzt.
      const content =
        typeof payload.chunk_text === 'string'
          ? payload.chunk_text
          : extractMultiFieldContent(payload);
      if (content && containsNormalized(content, query)) hits += 1;
    }

    if (page.points.length < SCROLL_PAGE || page.next_page_offset == null) break;
    offset = page.next_page_offset as string | number;
  }

  return hits;
}

async function main(): Promise<void> {
  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });
  const service = new DocumentSearchService();
  const manualCases = RETRIEVAL_CASES.filter((c) => (c.kind ?? 'qa') === 'manual');
  const rows: Row[] = [];

  for (const evalCase of manualCases) {
    const config = getSystemCollectionConfig(evalCase.collection);
    if (!config) continue;
    const params = getSearchParams(evalCase.collection);

    const resp = await service.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: params.limit,
        mode: 'hybrid',
        vectorWeight: MANUAL_VECTOR_WEIGHT,
        textWeight: MANUAL_TEXT_WEIGHT,
        threshold: params.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: params.recallLimit,
        qualityMin: params.qualityMin,
        additionalFilter: applyDefaultFilter(evalCase.collection, undefined),
      },
    } as Parameters<DocumentSearchService['search']>[0]);

    const results = ((resp.results ?? []) as DocumentResult[])
      .filter((r) => r.similarity_score >= MANUAL_MIN_SCORE)
      .slice(0, DOCS_PER_CASE);

    for (const r of results) {
      const actual = await trueMentionCount(
        client,
        config.qdrantCollection,
        r.document_id,
        evalCase.query
      );
      rows.push({
        query: evalCase.query,
        title: (r.title ?? '?').slice(0, 44),
        counted: r.term_chunk_count,
        actual,
      });
    }
    console.log(`· ${evalCase.query} @ ${evalCase.collection}: ${results.length} Dokumente`);
  }

  // Nur Dokumente, die den Begriff überhaupt tragen — bei rein semantischen
  // Treffern zeigt die Karte ohnehin keinen Zähler an.
  const withTerm = rows.filter((r) => r.actual > 0);
  const exact = withTerm.filter((r) => r.counted === r.actual);
  const under = withTerm.filter((r) => r.counted < r.actual);
  const over = withTerm.filter((r) => r.counted > r.actual);

  const pct = (n: number) => ((n / (withTerm.length || 1)) * 100).toFixed(1);
  console.log(`\n── ${withTerm.length} Dokumente mit wörtlichem Treffer ──`);
  console.log(`exakt:      ${exact.length} (${pct(exact.length)} %)`);
  console.log(`zu niedrig: ${under.length} (${pct(under.length)} %)`);
  console.log(`zu hoch:    ${over.length} (${pct(over.length)} %)`);

  if (under.length > 0) {
    const worst = [...under].sort((a, b) => b.actual - b.counted - (a.actual - a.counted));
    console.log('\nGrösste Untertreibungen:');
    for (const r of worst.slice(0, 12)) {
      console.log(
        `  ${String(r.counted).padStart(3)} statt ${String(r.actual).padStart(3)}  ${r.title}  („${r.query}")`
      );
    }
  }
  if (over.length > 0) {
    console.log('\nÜbertreibungen (dürfte es nicht geben):');
    for (const r of over.slice(0, 12)) {
      console.log(`  ${r.counted} statt ${r.actual}  ${r.title}  („${r.query}")`);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Mention count check failed:', error);
  process.exit(1);
});
