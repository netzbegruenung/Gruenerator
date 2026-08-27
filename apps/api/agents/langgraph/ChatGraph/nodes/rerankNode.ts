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

/** Excerpt per candidate handed to the cross-encoder. */
const RERANK_EXCERPT_CHARS = 1200;

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

  const items: RerankableItem[] = candidates.map((r) => {
    const item: RerankableItem = {
      title: r.title,
      // The cross-encoder scores THIS text, so the excerpt decides which sources
      // survive. At 300 chars a crawled page whose relevant passage sits further
      // in was judged on its boilerplate header — a selection loss that then
      // propagates into everything downstream.
      content: r.content.slice(0, RERANK_EXCERPT_CHARS),
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
