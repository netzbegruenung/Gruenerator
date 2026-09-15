/**
 * Rerank Node
 *
 * Uses the shared rerankPipeline (Regolo cross-encoder + MMR diversity)
 * to rerank search results by semantic relevance. Sits between the search
 * and respond nodes in the graph pipeline.
 *
 * Adds source-type tags so the cross-encoder can leverage provenance info.
 */

import { getChatNotebookProfile } from '../../../../config/notebookDepthProfiles.js';
import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  DEFAULT_RELEVANCE,
  rerankPipeline,
  type RerankableItem,
} from '../../../../services/search/rerankPipeline.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type ChatGraphState } from '../types.js';

import { MAX_SOURCES } from './citableSources.js';

const log = createLogger('ChatGraph:Rerank');

/*
 * KEIN Auszugsfenster mehr — der Cross-Encoder liest den ganzen Kandidaten.
 *
 * Hier stand nacheinander ein Kopfschnitt auf 1200, dann einer auf 1500, dann
 * ein anfragebezogener Auszug derselben Grösse. Gemessen am 28.08.2026 über
 * `evals/retrieval` (52 Fälle, EVAL_RERANK=1, dieselben Kandidaten in
 * derselben Reihenfolge, Werte nach Rerank):
 *
 *   Fenster  Auswahl        Hit@1   Hit@3   MRR@10   Encoder (Median)
 *   1200     Kopf           34,6 %  76,9 %  0,554     854 ms
 *   1500     Kopf           26,9 %  63,5 %  0,481    1051 ms
 *   1500     anfragebezogen 40,4 %  71,2 %  0,580    1021 ms
 *   3000     Kopf           38,5 %  63,5 %  0,552    1433 ms
 *   3000     anfragebezogen 34,6 %  65,4 %  0,539    1397 ms
 *   ohne Fenster (ganz)     48,1 %  73,1 %  0,622    1906 ms  ← jetzt
 *
 * Bei n=52 sind 1,9 Punkte ein Fall, und die beiden Kopf-Zeilen 1200/1500
 * unterscheiden sich um 7,7 Punkte in die FALSCHE Richtung — unterhalb von rund
 * acht Punkten löst diese Vorrichtung nichts auf. Genau deshalb entscheidet
 * hier die einzige Zeile, die darüber liegt und zweimal identisch gemessen
 * wurde: **der Preis des Fensters ist grösser als die Wahl des Schnitts.**
 *
 * **Warum das Fenster überhaupt bestehen konnte.** `r.content` ist bei
 * Sammlungstreffern `relevant_content` — der mit `\n\n---\n\n` verkettete
 * Auszug von bis zu `CONTENT_MAX_CHUNKS_PER_DOC` (10) bereits gefundenen
 * Chunks (`BaseSearchService`, ~Zeile 449). Ein Kopfschnitt darauf liest nicht
 * „den Anfang einer Seite", er wirft acht von zehn Belegen weg, und weil ein
 * Treffer-Chunk nach vorn gezogen wird, bevorzugt der Rest ausgerechnet das
 * lexikalische Signal, das der Cross-Encoder korrigieren soll.
 *
 * **Warum es jetzt weg kann (#2998).** Das Fenster war die Abwehr gegen
 * unbegrenzte Kandidaten. Die gab es nur an zwei Stellen in `searchNode`, die
 * `selectAndCrawlTopUrls` riefen und rohes `fullContent` durchreichten; beide
 * laufen jetzt über `crawlAndDistill` (`WEB_CRAWL_TARGET_CHARS`, 8000). Damit
 * ist JEDER Kandidat schon beim Eintritt begrenzt — Sammlungstreffer durch die
 * Zehn-Chunk-Bauform (gemessenes Maximum 15 645 Zeichen), gecrawlte Seiten
 * durch ihr Destillat. `rerankPipeline` zieht zusätzlich eine Decke pro Aufruf,
 * falls je wieder jemand Unbegrenztes hereinreicht.
 *
 * Der Preis steht dabei: Encoder-Median 854 → 1906 ms, gegen Loop-Turns von
 * 7,9 s / 9,4 s.
 *
 * Wer hier wieder schneiden will, misst vorher — und erweitert dafür
 * `RETRIEVAL_CASES` (53 Fälle), sonst misst er Rauschen.
 */

/**
 * Obergrenze für Überlebende — nur noch im Zweig OHNE Notebook-Bezug.
 *
 * War einmal die hartcodierte Zahl des Notebook-Pfads und galt nach dessen
 * Vereinheitlichung für beide Zweige. Seit notebook-gebundene Turns ihre
 * Zahlen aus dem Stufenprofil nehmen (`getChatNotebookProfile`), ist sie das
 * nicht mehr: dort sind es 18, also mehr als hier steht.
 */
const RERANK_OUTPUT_CEILING = 12;

function getSourceTag(source: string): string {
  if (source.startsWith(SOURCE_PREFIX.GRUENERATOR)) return 'Parteidokument';
  // Official DIP records. Untagged they fell through to the generic 'Quelle'
  // while the instruct below tells the cross-encoder to prefer "official party
  // documents" — harmless while a turn is all-DIP (one tag for every
  // candidate), but it would rank a crawled web text above a Plenarprotokoll
  // the moment DIP and collection results ever share one pool.
  if (source === SOURCE_PREFIX.BUNDESTAG) return 'Parlamentsdokument';
  if (source.startsWith(SOURCE_PREFIX.DOCUMENT)) return 'Nutzerdokument';
  if (source === SOURCE_PREFIX.WEB) return 'Web';
  if (source === SOURCE_PREFIX.EXAMPLES) return 'Beispiel';
  if (source === SOURCE_PREFIX.RESEARCH) return 'Recherche';
  return 'Quelle';
}

export async function rerankNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, hasTemporal, researchBrief } = state;
  const rerankCfg = vectorConfig.get('rerank');

  // Includes agents bound to notebooks via `defaultNotebookIds` so they get the
  // same deeper rerank window as an explicitly selected notebook.
  const isNotebookScoped =
    (state.notebookCollectionIds?.length ?? 0) > 0 ||
    (state.defaultNotebookCollectionIds?.length ?? 0) > 0 ||
    (state.notebookDocumentIds?.length ?? 0) > 0;

  // The window follows what actually arrived, not a fixed config value.
  // RERANK_INPUT_LIMIT (16) sits BELOW what the top search tier fetches
  // (`tiefenrecherche`: 20 via searchDepth.ts TIER_CONFIG), so the last results
  // were paid for at Linkup and then dropped before the cross-encoder ever
  // scored them — a silent loss on the most expensive tier. Deriving the window
  // from `searchResults.length` makes that impossible by construction and needs
  // no `tier` field on ChatGraphState.
  //
  // Für notebook-gebundene Turns kommen beide Zahlen aus dem Stufenprofil
  // (`CHAT_NOTEBOOK_DEPTH`), dieselbe Quelle, aus der `searchNode` seine
  // Kandidatenzahl nimmt. Das ist die Entkopplung, die dieser Zweig gebraucht
  // hat: `MAX_SOURCES` beantwortet die Frage „wie viele Quellen passen in den
  // Prompt", nicht „wie viele Kandidaten darf der Cross-Encoder bewerten". Als
  // Eingabefenster gelesen deckelte es die Auswahl auf die Größe des
  // Ergebnisses — 10 Kandidaten hinein, 10 hinaus, also gar keine Auswahl. Das
  // Fenster darf über MAX_SOURCES liegen; die Prompt-Decke zieht danach
  // `buildCitableSources`, und `rerankOutput` (18) bleibt darunter.
  const profile = isNotebookScoped ? getChatNotebookProfile() : null;
  const inputLimit = profile
    ? profile.rerankInput
    : Math.min(MAX_SOURCES, Math.max(rerankCfg.inputLimit, searchResults.length));
  // Zwei Zweige, zwei Obergrenzen — und die des einen gilt ausdrücklich nicht
  // für den anderen:
  //  - notebook-gebunden: `profile.rerankOutput` (18). Liegt ÜBER
  //    RERANK_OUTPUT_CEILING und soll das auch; die Grenze nach oben ist hier
  //    `MAX_SOURCES`, siehe chatNotebookDepth.vitest.ts.
  //  - sonst: die Ausgabe skaliert mit dem Eingang, nie unter dem
  //    konfigurierten Wert und nie über die 12, die der Notebook-Pfad trug,
  //    bevor er auf das Stufenprofil umgezogen ist.
  const outputLimit = profile
    ? profile.rerankOutput
    : Math.min(RERANK_OUTPUT_CEILING, Math.max(rerankCfg.outputLimit, searchResults.length));

  if (searchResults.length <= 2) {
    log.info(`[Rerank] Skipping — only ${searchResults.length} results`);
    return { rerankTimeMs: Date.now() - startTime };
  }

  const candidates = searchResults.slice(0, inputLimit);

  log.info(
    `[Rerank] Reranking ${candidates.length} results for query: "${searchQuery?.slice(0, 50)}..."`
  );

  const baseInstruct = 'Given a search query, retrieve relevant passages that answer the query.';
  const sourceHint = ' Prefer official party documents and verified sources over web snippets.';
  const temporalHint = hasTemporal ? ' Prefer recent sources.' : '';
  const instruct = `${baseInstruct}${sourceHint}${temporalHint}`;

  const queryStr = researchBrief ? `${searchQuery}\n${researchBrief}` : searchQuery || '';

  // Der ganze Kandidat, ungeschnitten — siehe den Block oben. Was hier
  // hineingeht, ist beim Eintritt begrenzt; die Decke pro Aufruf zieht
  // `rerankPipeline`, damit sie an EINER Stelle steht und nicht an fünf.
  const items: RerankableItem[] = candidates.map((r) => {
    const item: RerankableItem = {
      title: r.title,
      content: r.content,
      source: r.source,
    };
    if (r.relevance != null) {
      item.relevance = r.relevance;
    }
    return item;
  });

  const pipelineResult = await rerankPipeline({
    query: queryStr,
    items,
    inputLimit,
    outputLimit,
    instruct,
    sourceTagFn: (item) => getSourceTag(item.source || ''),
  });
  const { rankedIndices, scores, rerankTimeMs } = pipelineResult;

  const reranked = rankedIndices.flatMap((i) => {
    const candidate = candidates[i];
    if (!candidate) return [];
    return [
      {
        ...candidate,
        source: candidate.source ?? '',
        relevance: scores.get(i) ?? candidate.relevance ?? DEFAULT_RELEVANCE,
      },
    ];
  });

  log.info(
    `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms`
  );

  // Top cross-encoder confidence — quality gate reads this to decide whether
  // its LLM coverage check is needed. Null on failure so the gate falls back
  // to its existing LLM path (safety net preserved).
  const scoreValues = Array.from(scores.values());
  const topRerankScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;

  if (pipelineResult.failed) {
    log.error(
      `[Rerank] Cross-encoder failed; returning input order. error=${pipelineResult.error}`
    );
    return {
      searchResults: reranked,
      rerankTimeMs,
      rerankFailed: true,
      topRerankScore: null,
      searchErrors: [
        { source: 'rerank', message: pipelineResult.error ?? 'rerank failed (unknown error)' },
      ],
    };
  }

  return {
    searchResults: reranked,
    rerankTimeMs,
    topRerankScore,
  };
}
