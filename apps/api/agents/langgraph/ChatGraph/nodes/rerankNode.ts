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
import { selectRelevantExcerpt } from '../../../../services/search/relevantExcerpt.js';
import {
  DEFAULT_RELEVANCE,
  rerankPipeline,
  type RerankableItem,
} from '../../../../services/search/rerankPipeline.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type ChatGraphState } from '../types.js';

import { MAX_SOURCES } from './citableSources.js';

const log = createLogger('ChatGraph:Rerank');

/**
 * Excerpt per candidate handed to the cross-encoder.
 *
 * Folgt dem Auszugsmass der Suche (`CONTENT_MAX_EXCERPT_LENGTH`, 1500) statt
 * einer eigenen Zahl — die private 1200 lag darunter und schnitt damit noch
 * einmal, was die Suchschicht schon zugeschnitten hatte.
 *
 * **Was hier wirklich geschnitten wird, ist kein Chunk.** `r.content` ist
 * `relevant_content`, und das ist der mit `\n\n---\n\n` verkettete Auszug von
 * bis zu `CONTENT_MAX_CHUNKS_PER_DOC` (10) Chunks eines Dokuments
 * (`BaseSearchService`, ~Zeile 472). Ein Kopfschnitt auf 1200 zeigte dem
 * Encoder also grob den ERSTEN von zehn Chunks — ausgewählt von nichts als der
 * Reihenfolge.
 *
 * Gemessen am 28.08.2026 über `evals/retrieval` (52 Fälle, EVAL_RERANK=1,
 * dieselben Kandidaten in derselben Reihenfolge, Werte nach Rerank):
 *
 *   Fenster  Auswahl        Hit@1   Hit@3   MRR@10   Encoder (Median)
 *   1200     Kopf (bisher)  34,6 %  76,9 %  0,554     854 ms
 *   1500     Kopf           26,9 %  63,5 %  0,481    1051 ms
 *   1500     anfragebezogen 40,4 %  71,2 %  0,580    1021 ms  ← jetzt
 *   3000     Kopf           38,5 %  63,5 %  0,552    1433 ms
 *   3000     anfragebezogen 34,6 %  65,4 %  0,539    1397 ms
 *   ohne Fenster (ganz)     48,1 %  73,1 %  0,622    1906 ms
 *
 * **Die Grenzen dieser Messung gehören dazu.** n=52, ein Fall sind 1,9
 * Prozentpunkte, und die beiden Kopf-Zeilen 1200/1500 unterscheiden sich um
 * 7,7 Punkte in die falsche Richtung — Unterschiede unterhalb von rund acht
 * Punkten löst diese Vorrichtung nicht auf. Belastbar ist nur, was über alle
 * Läufe gleich blieb: **gar nicht schneiden ist am besten** (48,1 % / 0,622,
 * zweimal identisch gemessen), und das ist die Zeile, die zählt — der Preis
 * des Fensters ist grösser als die Wahl des Schnitts. Ein grösseres Fenster
 * kostet Wanduhr (854 → 1906 ms gegen Loop-Turns von 7,9 s / 9,4 s) und ist
 * bei gecrawlten Kandidaten nicht beliebig zu haben; siehe den Nachtrag an
 * #2824.
 */
function rerankExcerptChars(): number {
  return vectorConfig.get('content').maxExcerptLength;
}

/**
 * Ab welchem Vielfachen des Fensters ein Kandidat als „viel länger als das
 * Fenster" gilt und sein Auszug nach Anfrage statt nach Position gewählt wird.
 *
 * Das Tor ist da, weil ein Kandidat, der ungefähr fenstergross ist, nichts zu
 * wählen übrig lässt: die Auswahl wäre dann Rauschen auf einem Text, der
 * ohnehin fast ganz durchgeht. Die Belege FÜR die Auswahl stammen aus dem
 * anderen Regime — vielchunkige Aggregate, gecrawlte Seiten und angehängte
 * PDFs, wo `firstRelevantOffset` bei 3219/9966/8673 lag (#2289).
 */
export const RERANK_FOCUS_MIN_RATIO = 2;

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
  const excerptChars = rerankExcerptChars();

  log.info(
    `[Rerank] Reranking ${candidates.length} results for query: "${searchQuery?.slice(0, 50)}..."`
  );

  const baseInstruct = 'Given a search query, retrieve relevant passages that answer the query.';
  const sourceHint = ' Prefer official party documents and verified sources over web snippets.';
  const temporalHint = hasTemporal ? ' Prefer recent sources.' : '';
  const instruct = `${baseInstruct}${sourceHint}${temporalHint}`;

  const queryStr = researchBrief ? `${searchQuery}\n${researchBrief}` : searchQuery || '';

  // Wie oft das Fenster wirklich query-bezogen gefüllt wurde, und wie weit
  // hinten die beste Passage lag. Der zweite Wert ist `firstRelevantOffset` aus
  // #2289: liegt er über excerptChars, hätte der Kopfschnitt an dieser
  // Stelle den falschen Text bewertet. Das ist die Messung, die #2824 für
  // diesen Schnitt verlangt — sie steht in jedem Turn-Log, nicht in einer
  // einmaligen Erhebung.
  let focused = 0;
  let beyondWindow = 0;
  let maxOffset = 0;

  const items: RerankableItem[] = candidates.map((r) => {
    // The cross-encoder scores THIS text, so the excerpt decides which sources
    // survive. At 300 chars a crawled page whose relevant passage sits further
    // in was judged on its boilerplate header — a selection loss that then
    // propagates into everything downstream. Raising the window to 1200 moved
    // the boundary; it did not remove it. `selectRelevantExcerpt` fills the
    // window with the passages the query points at and falls back to exactly
    // this head cut whenever the query gives it nothing to go on.
    // Nur für Kandidaten, die das Fenster deutlich überschreiten — siehe
    // RERANK_FOCUS_MIN_RATIO. `contiguous`, weil der Encoder zusammenhängenden
    // Text bewertet; die zusammengesetzte Form urteilte messbar schlechter.
    const excerpt =
      r.content.length >= excerptChars * RERANK_FOCUS_MIN_RATIO
        ? selectRelevantExcerpt(r.content, queryStr, excerptChars, 'contiguous')
        : null;
    if (excerpt) {
      focused++;
      maxOffset = Math.max(maxOffset, excerpt.firstRelevantOffset);
      if (excerpt.firstRelevantOffset >= excerptChars) beyondWindow++;
    }

    const item: RerankableItem = {
      title: r.title,
      content: excerpt?.text ?? r.content.slice(0, excerptChars),
      source: r.source,
    };
    if (r.relevance != null) {
      item.relevance = r.relevance;
    }
    return item;
  });

  if (focused > 0) {
    log.info(
      `[Rerank] Excerpt: ${focused}/${candidates.length} query-focused, ` +
        `${beyondWindow} with the best passage beyond the ${excerptChars}-char window ` +
        `(max firstRelevantOffset ${maxOffset})`
    );
  }

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
