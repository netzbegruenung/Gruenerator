/**
 * Was kosten die Auszugs-Deckel — und greift der Kopfschnitt daneben?
 *
 *   pnpm --filter @gruenerator/api eval:excerpt
 *
 * Zwei Messungen aus #2824, beide über den echten Suchpfad gegen die
 * Qdrant-Instanz aus `QDRANT_URL`:
 *
 * **1. Der Tausch aus #2812.** `CONTENT_MAX_EXCERPT_LENGTH` ging von 300 auf
 * 1500, begründet, aber nicht gemessen. `extractMatchedExcerpt` zentriert nur
 * dann auf einen Treffer, wenn die GANZE Anfrage wörtlich im Chunk steht — bei
 * einer natürlichsprachigen Frage nie. Der Deckel ist dort also ein
 * Kopfschnitt, und was er kostet, steht in der Chunk-Länge: wie viele der
 * abgerufenen Chunks über 300 liegen (wurden geschnitten), wie viele über 1500
 * (werden es noch), und wie viel Text dabei wegfällt.
 *
 * **2. Das Rerank-Fenster.** `rerankNode` bewertet Kandidaten auf ihren ersten
 * `RERANK_EXCERPT_CHARS`. `firstRelevantOffset` — der Offset der bestbewerteten
 * Passage im Original — sagt, wo die Anfrage wirklich getroffen wird. Liegt er
 * über dem Fenster, hätte der Kopfschnitt den falschen Text bewertet. #2289 hat
 * die Zahl an gecrawlten Seiten erhoben (3219/9966/8673); hier steht sie für
 * den Korpus, den wir tatsächlich ranken.
 *
 * Gemessen wird auf BEIDEN Ebenen, weil sie verschieden gross sind: der
 * einzelne Chunk und `relevant_content`, das der Knoten wirklich schneidet —
 * die mit `\n\n---\n\n` verkettete Fassung von bis zu
 * `CONTENT_MAX_CHUNKS_PER_DOC` Chunks. Wer nur den Chunk misst, hält den
 * Kopfschnitt für harmloser, als er ist.
 *
 * Das Skript braucht keine Instrumentierung: `top_chunks[].text` ist der Chunk
 * ungekürzt, `relevant_content` steht ohnehin am Ergebnis.
 *
 * Nur eine Erhebung, kein Urteil: es misst, wie hart die Deckel binden, nicht
 * ob eine Antwort dadurch besser wird. Das beantwortet `eval:retrieval`.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

const { vectorConfig } = await import('../../config/vectorConfig.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { selectRelevantExcerpt } = await import('../../services/search/relevantExcerpt.js');
const { RETRIEVAL_CASES } = await import('./cases.js');

import type { DocumentResult } from '../../services/BaseSearchService/types.js';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;

/** Die Plätze, die überhaupt in einen Prompt kommen. */
const TOP_N = 10;

/** Der Wert vor #2812 und der heutige — beide werden gegen dieselben Chunks gerechnet. */
const EXCERPT_CAPS = [300, 1500] as const;

/** Dasselbe Fenster wie `rerankNode` — beide lesen `CONTENT_MAX_EXCERPT_LENGTH`. */
const RERANK_WINDOW = vectorConfig.get('content').maxExcerptLength;

interface ChunkStat {
  length: number;
  /** Offset der besten Passage, oder null wenn die Anfrage nichts hergab. */
  offset: number | null;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? 0;
}

async function main(): Promise<void> {
  const configured = vectorConfig.get('content').maxExcerptLength;
  console.log(`CONTENT_MAX_EXCERPT_LENGTH aktuell: ${configured}`);
  console.log(`Rerank-Fenster: ${RERANK_WINDOW}\n`);

  const service = new DocumentSearchService();
  const chunks: ChunkStat[] = [];
  const aggregates: ChunkStat[] = [];
  let queriesWithHits = 0;

  for (const evalCase of RETRIEVAL_CASES) {
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

    const top = ((resp.results ?? []) as DocumentResult[]).slice(0, TOP_N);
    if (top.length === 0) continue;
    queriesWithHits++;

    for (const result of top) {
      // Das, was `rerankNode` als `r.content` bekommt.
      const aggregate = result.relevant_content ?? '';
      if (aggregate) {
        const pickedAgg = selectRelevantExcerpt(aggregate, evalCase.query, RERANK_WINDOW);
        aggregates.push({
          length: aggregate.length,
          offset: pickedAgg?.firstRelevantOffset ?? null,
        });
      }
      for (const chunk of result.top_chunks ?? []) {
        const text = chunk.text ?? '';
        if (!text) continue;
        const picked = selectRelevantExcerpt(text, evalCase.query, RERANK_WINDOW);
        chunks.push({ length: text.length, offset: picked?.firstRelevantOffset ?? null });
      }
    }
  }

  if (chunks.length === 0) {
    console.log('Keine Chunks abgerufen — Index leer oder nicht erreichbar.');
    process.exit(1);
  }

  const lengths = chunks.map((c) => c.length);
  const total = lengths.reduce((n, l) => n + l, 0);

  console.log(
    `${chunks.length} Chunks aus ${queriesWithHits} Anfragen mit Treffern ` +
      `(${RETRIEVAL_CASES.length} Fälle insgesamt)\n`
  );
  console.log('── Chunk-Längen ──');
  console.log(`Mittel   ${Math.round(total / chunks.length)}`);
  console.log(`Median   ${percentile(lengths, 0.5)}`);
  console.log(`p90      ${percentile(lengths, 0.9)}`);
  console.log(`Maximum  ${Math.max(...lengths)}\n`);

  console.log('── Was der Deckel wegschneidet ──');
  for (const cap of EXCERPT_CAPS) {
    const cutChunks = lengths.filter((l) => l > cap);
    const droppedChars = cutChunks.reduce((n, l) => n + (l - cap), 0);
    const marker = cap === configured ? '  ← aktiv' : '';
    console.log(
      `${String(cap).padStart(5)}: ${String(cutChunks.length).padStart(4)}/${chunks.length} Chunks gekürzt ` +
        `(${((cutChunks.length / chunks.length) * 100).toFixed(1)} %), ` +
        `${droppedChars.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Zeichen weg ` +
        `(${((droppedChars / total) * 100).toFixed(1)} %)${marker}`
    );
  }

  const aggLengths = aggregates.map((a) => a.length);
  if (aggLengths.length > 0) {
    console.log('\n── relevant_content (was rerankNode wirklich schneidet) ──');
    console.log(
      `${aggregates.length} Kandidaten  Mittel ${Math.round(aggLengths.reduce((n, l) => n + l, 0) / aggLengths.length)}  ` +
        `Median ${percentile(aggLengths, 0.5)}  p90 ${percentile(aggLengths, 0.9)}  ` +
        `Maximum ${Math.max(...aggLengths)}`
    );
    const overWindow = aggLengths.filter((l) => l > RERANK_WINDOW).length;
    console.log(
      `über dem Fenster (${RERANK_WINDOW}): ${overWindow}/${aggregates.length} ` +
        `(${((overWindow / aggregates.length) * 100).toFixed(1)} %) — bei diesen entscheidet ` +
        `der Schnitt, welche der verketteten Chunks der Encoder überhaupt sieht`
    );
  }

  for (const [label, pool] of [
    ['je Chunk', chunks],
    ['je Kandidat (relevant_content)', aggregates],
  ] as const) {
    console.log(`\n── Wo die Anfrage wirklich getroffen wird — ${label} ──`);
    const withOffset = pool.filter((c): c is ChunkStat & { offset: number } => c.offset !== null);
    if (withOffset.length === 0) {
      console.log('Kein verwertbares Signal — alles bleibt beim Kopfschnitt.');
      continue;
    }
    const offsets = withOffset.map((c) => c.offset);
    const beyond = offsets.filter((o) => o >= RERANK_WINDOW).length;
    console.log(
      `${withOffset.length}/${pool.length} mit verwertbarem Signal ` +
        `(der Rest fällt auf den Kopfschnitt zurück, wie bisher)`
    );
    console.log(`Median firstRelevantOffset  ${percentile(offsets, 0.5)}`);
    console.log(`p90                         ${percentile(offsets, 0.9)}`);
    console.log(`Maximum                     ${Math.max(...offsets)}`);
    console.log(
      `jenseits des Fensters       ${beyond}/${withOffset.length} ` +
        `(${((beyond / withOffset.length) * 100).toFixed(1)} %) — dort bewertete der ` +
        `Kopfschnitt den falschen Text`
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Excerpt cut check failed:', error);
  process.exit(1);
});
