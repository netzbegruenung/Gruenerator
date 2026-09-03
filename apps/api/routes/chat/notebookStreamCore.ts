/**
 * Notebook Stream Core
 * Shared SSE streaming logic for notebook Q&A, used by both the authenticated
 * notebook controller and the public Gruen-O-Mat controller.
 */

import { type NotebookDepth } from '@gruenerator/contracts';
import { type ModelMessage } from 'ai';

import {
  buildConcisePromptGrundsatz,
  buildConcisePromptGeneral,
} from '../../agents/langgraph/prompts.js';
import { env } from '../../config/env.js';
import { getNotebookDepthProfile } from '../../config/notebookDepthProfiles.js';
import {
  SYSTEM_COLLECTIONS,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { rerankNotebookResults } from '../../services/notebook/rerankNotebookResults.js';
import {
  renumberCitationsInOrder,
  validateAndInjectCitations,
  groupSourcesByCollection,
  toClientSource,
  sourceTextForPrompt,
} from '../../services/search/index.js';
import { expandQuery } from '../../services/search/QueryExpansionService.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../services/telemetry/langfuseTelemetry.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { containsPromptLeakage } from '../gruenomat/topicGuard.js';

import { isProviderConfigured } from './agents/providers.js';
import {
  buildRewriteTranscript,
  mergeCarriedCitations,
  normalizeNotebookHistory,
  prepareNotebookHistory,
} from './services/notebookHistoryService.js';
import {
  resolveModel,
  streamForResolution,
  streamWithFallback,
} from './services/responseStreamingService.js';
import { PROGRESS_MESSAGES, SSEWriter, sendChatWarning } from './services/sseHelpers.js';

import type { SearchContext } from '../../services/notebook/types.js';
import type { CollectionConfig, SourcesByCollection } from '../../services/search/types.js';
import type express from 'express';

const log = createLogger('NotebookStreamCore');
const notebookHelper = new NotebookQdrantHelper();

const DEFAULT_PROVIDER = 'mistral';
const DEFAULT_MODEL = 'mistral-medium-2604';

export interface NotebookStreamOptions {
  req: express.Request;
  res: express.Response;
  messages: ModelMessage[];
  collectionId?: string;
  collectionIds?: string[];
  filters?: Record<string, unknown>;
  model?: string;
  mode?: NotebookDepth;
  userId?: string;
  allowUserCollections?: boolean;
  systemPromptOverride?: string;
  /** Custom message when too few results survive reranking (Layer 4). */
  noResultsMessage?: string;
  /** Minimum results after rerank to proceed with generation (default: 0 = no gate). */
  minResultsForGeneration?: number;
  /**
   * Ob dieser Turn `evidence_weak` senden darf. Der Grün-O-Mat setzt `false`:
   * er fährt `mode: 'fast'` — ein Tiefenprofil, das in der Kalibrierung nicht
   * vorkam (alle 15 Fälle liefen `deep`) — und hat mit `topicGuard` plus
   * `OFF_TOPIC_RESPONSE` seine eigene, härtere Themenabwehr. Berechnet und
   * protokolliert wird der Wert dort trotzdem. Default: `true`.
   */
  emitEvidenceWarning?: boolean;
  /** Filter search to specific document IDs within the collection. */
  documentIds?: string[];
  /** Shared SSE writer — if provided, used instead of creating one internally. */
  sse?: SSEWriter;
  /**
   * `'off'` skips `rerankNotebookResults` entirely — results stay in the
   * order `getSearchContext` returned. `'sort'`/`'filter'` and `instruct`
   * pass through to `rerankNotebookResults`. Absent behaves like today.
   */
  rerank?: { mode?: 'off' | 'sort' | 'filter'; instruct?: string };
  /**
   * When false, the function does NOT call `sse.end()` on success or error
   * paths — the caller is responsible for closing the stream after running
   * its own follow-up work (e.g. canvas-suggest tail step). Defaults to true.
   */
  closeStream?: boolean;
}

export interface NotebookStreamResult {
  answer: string;
  citations: unknown[];
  sources: unknown[];
  question: string;
  /** Langfuse trace of the turn; null when Langfuse is disabled. Target for thumbs feedback. */
  traceId: string | null;
}

export async function handleNotebookStream(
  options: NotebookStreamOptions
): Promise<NotebookStreamResult | null> {
  const {
    req,
    res,
    messages,
    collectionId,
    collectionIds,
    filters,
    model,
    mode,
    userId,
    allowUserCollections = true,
    documentIds,
    emitEvidenceWarning = true,
  } = options;

  // An omitted mode has always meant the thorough tier here (`isFast` was
  // `mode === 'fast'`), so it keeps meaning that. The UI's default is a
  // separate question and belongs to the UI.
  const depth: NotebookDepth = mode ?? 'deep';
  const profile = getNotebookDepthProfile(depth);

  // SSE headers (skip if already flushed by controller for thread_created)
  if (!res.headersSent) {
    SSEWriter.initHeaders(res);
  }

  const sse = options.sse ?? new SSEWriter(res);

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
  });

  try {
    if (!messages || messages.length === 0) {
      sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired, code: 'invalid_request' });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    if (!collectionId && (!collectionIds || collectionIds.length === 0)) {
      sse.send('error', { error: 'Es wurde kein Notebook angegeben.', code: 'invalid_request' });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    if (!lastUserMessage || typeof lastUserMessage.content !== 'string') {
      sse.send('error', {
        error: 'Die Anfrage enthielt keine Nutzernachricht.',
        code: 'invalid_request',
      });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    const question = lastUserMessage.content;
    const t0 = Date.now();

    const lastUserIdx = messages.lastIndexOf(lastUserMessage);
    const incomingHistory = normalizeNotebookHistory(messages.slice(0, lastUserIdx));
    // Prompt-Verlauf ist eine Ultra-Fähigkeit (profile.history). Die Stufen
    // darunter verwerfen ihn für den Prompt AUSDRÜCKLICH — der Chat-Client hat
    // immer den vollen Thread geschickt, und ohne dieses Gitter landete er
    // unbudgetiert in den Modellnachrichten.
    let history = profile.history ? incomingHistory : [];
    if (!profile.history && incomingHistory.length > 0) {
      log.debug(
        `[Notebook] Dropping ${incomingHistory.length} history messages from the prompt (tier ${depth})`
      );
    }

    sse.send('search_start', { message: 'Suche in Dokumenten...' });

    // Die Suchanfrage: umgeschrieben gegen den Verlauf, wenn die Stufe es
    // erlaubt und Verlauf da ist („und in Bayern?" trägt kein Thema); dazu
    // Paraphrasen, wenn die Stufe mehr als eine Formulierung sucht. Beides ist
    // EIN expandQuery-Aufruf; ohne Verlauf und mit einer Variante gibt es keinen.
    let queries = [question];
    const wantsRewrite = profile.queryRewrite && incomingHistory.length > 0;
    if (wantsRewrite || profile.queryVariants > 1) {
      const expanded = await expandQuery(
        question,
        wantsRewrite
          ? {
              historyContext: buildRewriteTranscript(incomingHistory),
              // `deep` rewrites but keeps a single query — asking for
              // alternatives it would immediately slice away is wasted spend.
              ...(profile.queryVariants <= 1 && { variants: 0 }),
            }
          : {}
      );
      queries = [expanded.primary, ...expanded.alternatives].slice(
        0,
        Math.max(1, profile.queryVariants)
      );
      if (queries.length > 1) {
        sse.send('progress_step', {
          stepId: 'notebook-query-expansion',
          toolName: 'notebook_search',
          title: `Suche mit ${queries.length} Formulierungen...`,
          status: 'in_progress',
          args: { queries },
        });
      }
    }

    // The reranker's cross-encoder must read the same query the candidates
    // were retrieved with. `queries[0]` is the rewritten standalone question
    // when the rewrite ran, and equals `question` unchanged when it was
    // skipped or failed — so the un-rewritten follow-up never reaches it.
    // `queries` is seeded with `question`, so it is never empty.
    const rerankQuery = queries[0];

    let searchContext: SearchContext | null;
    try {
      searchContext = await notebookQAService.getSearchContext({
        question,
        collectionId,
        collectionIds,
        userId: userId || 'anonymous',
        requestFilters: filters,
        depth,
        queries,
        getCollectionFn: async (id: string) => {
          const systemConfig = getSystemCollectionConfig(id);
          if (systemConfig) return null;
          if (!allowUserCollections) return null;
          return await notebookHelper.getNotebookCollection(id);
        },
        getDocumentIdsFn: async (id: string) => {
          if (!allowUserCollections) return [];
          const docs = await notebookHelper.getCollectionDocuments(id);
          const allIds = docs.map((d) => d.document_id);
          if (documentIds?.length) {
            return allIds.filter((docId) => documentIds.includes(docId));
          }
          return allIds;
        },
      });
    } catch (error: unknown) {
      log.error('Search context error:', error);
      log.debug(`⏱ Search context failed: ${Date.now() - t0}ms`);
      sse.send('error', {
        error: toUserFacingMessage(error, PROGRESS_MESSAGES.searchDegraded),
        code: 'search_degraded',
        retryable: true,
      });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    const t1 = Date.now();
    log.debug(
      `⏱ Search context: ${t1 - t0}ms, ${searchContext?.sortedResults.length ?? 0} results`
    );

    sse.send('search_complete', {
      message: searchContext
        ? `${searchContext.sortedResults.length} relevante Stellen gefunden`
        : '0 relevante Stellen gefunden',
      resultCount: searchContext?.sortedResults.length ?? 0,
    });

    // Rerank in EVERY tier.
    //
    // This used to be gated on `isFast`, which left "Tiefenrecherche" — the
    // path that retrieves the MOST candidates — as the only one without a
    // cross-encoder. That is inverse to what the UI promises: the mode
    // advertised as the thorough one was handing the model the raw
    // hybrid-search order.
    //
    // The tiers differ in HOW MUCH survives, not in WHETHER it is ranked.
    // rerankNotebookResults degrades openly — with Regolo unconfigured it
    // returns the original order rather than throwing — so a bigger window
    // cannot make a tier fail where a smaller one used to work.
    if (searchContext) {
      const rerankMode = options.rerank?.mode;
      const rerankInstruct = options.rerank?.instruct;
      if (rerankMode !== 'off') {
        const reranked = await rerankNotebookResults({
          results: searchContext.sortedResults,
          referencesMap: searchContext.referencesMap,
          question: rerankQuery,
          limit: profile.rerankOutput,
          inputLimit: profile.rerankInput,
          ...(rerankMode ? { mode: rerankMode } : {}),
          ...(rerankInstruct ? { instruct: rerankInstruct } : {}),
        });
        searchContext.sortedResults = reranked.results;
        searchContext.referencesMap = reranked.referencesMap;
        searchContext.contextSummary = reranked.contextSummary;

        log.debug(
          `⏱ Rerank (${depth}): ${reranked.rerankTimeMs}ms, ${searchContext.sortedResults.length} results kept`
        );
      }

      // The concise prompt exists to shrink the answer to match a shrunken
      // context. The thorough tiers are asked for a thorough answer and keep
      // the prompt getSearchContext chose.
      if (profile.conciseAnswer) {
        const isSystemCollection =
          searchContext.effectiveCollectionIds?.some((id) => !!getSystemCollectionConfig(id)) ??
          false;
        searchContext.systemPrompt = isSystemCollection
          ? buildConcisePromptGrundsatz(searchContext.collectionName || 'Grüne Dokumente').system
          : buildConcisePromptGeneral(searchContext.collectionName || 'Ihre Dokumente').system;
      }

      // Carry over the sources cited in recent answers: their passages join
      // the references map (deduped, behind the fresh hits) and the history's
      // old [N] markers are rewritten to the merged numbering. Without this,
      // an old marker would silently point at whatever source now holds that
      // number — and "was stand nochmal in Quelle 3?" would have no target.
      if (history.length > 0) {
        const carried = mergeCarriedCitations(searchContext.referencesMap, history);
        searchContext.referencesMap = carried.referencesMap;
        history = carried.history;
        if (carried.appended.length > 0) {
          const carriedLines = carried.appended
            .map(
              ({ id, ref }) =>
                `${id}. [aus früherer Antwort] ${ref.title} — "${sourceTextForPrompt(ref)}"`
            )
            .join('\n');
          searchContext.contextSummary += `\n\nBereits in früheren Antworten zitierte Quellen (weiterhin zitierbar):\n${carriedLines}`;
          log.debug(`[Notebook] ${carried.appended.length} carried sources appended`);
        }
      }
    }

    // Apply custom system prompt if provided (e.g. Gruen-O-Mat persona)
    if (options.systemPromptOverride && searchContext) {
      searchContext.systemPrompt = options.systemPromptOverride;
    }

    // Layer 4: Quality gate — require minimum results after rerank
    const minResults = options.minResultsForGeneration ?? 0;
    if (minResults > 0 && searchContext && searchContext.sortedResults.length < minResults) {
      const msg = options.noResultsMessage || 'Keine passenden Quellen gefunden.';
      log.info(
        'Quality gate: %d results < threshold %d',
        searchContext.sortedResults.length,
        minResults
      );
      sse.send('text_delta', { text: msg });
      sse.send('completion', {
        answer: msg,
        citations: [],
        sources: [],
        allSources: [],
        metadata: {
          totalResults: searchContext.sortedResults.length,
          qualityGateTriggered: true,
        },
      });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    // Evidenz-Signal (#3140): der dichte Spitzenwert VOR dem Rerank. Er wird in
    // `getSearchContext` gebildet, weil er hier nicht mehr rekonstruierbar wäre
    // — `rerankNotebookResults` schreibt den Cross-Encoder-Wert auf
    // `similarity` zurück und die Zeile weiter oben ersetzt die ganze Liste.
    // `searchContext.evidenceTop` selbst bleibt vom Rerank unberührt, deshalb
    // liefert das Feld auch hier — nach Rerank und Qualitäts-Gate — noch den
    // Vor-Rerank-Wert.
    //
    // Die Emission sitzt bewusst NACH dem Layer-4-Gate: eine verweigerte
    // Antwort soll nie mit der Warnung ausgestattet werden.
    //
    // Die Logzeile geht bei jeder beantworteten Anfrage hinaus (nicht bei einer
    // Abweisung durch die Qualitätsschranke), auch bei ausgeschaltetem Schalter: sie
    // ist die Produktionsmessung, die einzige Stelle, an der sichtbar wird, wo
    // das Signal auf echten Fragen liegt. Der Zahlenwert geht NICHT auf die
    // Leitung — die Wire-Gestalt bleibt { code, message }.
    const evidenceTop = searchContext?.evidenceTop ?? null;
    if (evidenceTop !== null) {
      const weak = evidenceTop < env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD;
      log.info(
        `[Notebook] evidenceTop=${evidenceTop.toFixed(4)} ` +
          `(threshold ${env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD.toFixed(3)}, ` +
          `enabled=${env.NOTEBOOK_EVIDENCE_WEAK_ENABLED}, ${depth}, ` +
          `${searchContext?.sortedResults.length ?? 0} candidates) → ${weak ? 'weak' : 'ok'}`
      );
      // Kalibriert nur auf `deep` (beide Runden) — `fast` durchsucht weniger
      // Kandidaten und wurde nie vermessen, `ultra` holt eine Obermenge von
      // `deep` und liegt darum mindestens genauso hoch.
      if (weak && env.NOTEBOOK_EVIDENCE_WEAK_ENABLED && emitEvidenceWarning && depth !== 'fast') {
        sendChatWarning(sse, 'evidence_weak');
      }
    } else {
      log.info(`[Notebook] evidenceTop=none (no candidates, ${depth})`);
    }

    // Handle no results case
    if (!searchContext) {
      const noResultsMessage = collectionId
        ? 'Leider konnte ich in dieser Sammlung keine passenden Stellen zu Ihrer Frage finden.'
        : 'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden.';

      sse.send('text_delta', { text: noResultsMessage });
      sse.send('completion', {
        answer: noResultsMessage,
        citations: [],
        sources: [],
        allSources: [],
        metadata: {
          isMulti: !!collectionIds && collectionIds.length > 0,
          totalResults: 0,
          citationsCount: 0,
        },
      });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    // Determine AI provider and model (same resolution as chat — handles model ID → real name)
    const defaultAgentConfig = { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
    const notebookRequestId = `notebook_${Date.now()}`;
    // No classifier on this surface — `auto` is pinned to the precise lane
    // (see resolveAutoSelection); the web client also pre-resolves it locally.
    const primaryResolution = await resolveModel(defaultAgentConfig, model, notebookRequestId, {
      surface: 'notebook',
    });

    if (!isProviderConfigured(primaryResolution.provider)) {
      sse.send('error', {
        error: PROGRESS_MESSAGES.aiUnavailable,
        code: 'provider_unavailable',
        retryable: true,
      });
      if (options.closeStream !== false) sse.end();
      return null;
    }

    // Layer 2: Use XML delimiters for content isolation when a system prompt override
    // is active (Gruen-O-Mat). This structurally separates user input from retrieved
    // documents, making it harder for injected instructions to be treated as system-level.
    const userContent = options.systemPromptOverride
      ? `<user_question>${question}</user_question>\n\n<retrieved_sources>\n${searchContext.contextSummary}\n</retrieved_sources>`
      : `Frage: ${question}\n\nVerfügbare Quellen:\n${searchContext.contextSummary}`;

    // Trim history at TURN boundaries against the resolved model window —
    // messages are never cut in the middle (a follow-up may refer to the end
    // of an answer). The volatile source block stays in the last user message,
    // so the system+history prefix remains prompt-cache-stable.
    const { messages: preparedHistory, droppedTurns } = prepareNotebookHistory(
      history,
      primaryResolution.contextWindow
    );
    let systemPromptFinal = searchContext.systemPrompt;
    if (droppedTurns > 0) {
      systemPromptFinal +=
        '\n\nHinweis: Ältere Nachrichten dieses Gesprächs wurden aus Platzgründen ausgelassen.';
    }
    if (history.length > 0) {
      log.info(
        `[Notebook] history: ${history.length} messages → ${preparedHistory.length} kept, ${droppedTurns} turns dropped`
      );
    }

    const aiMessages: ModelMessage[] = [
      { role: 'system', content: systemPromptFinal },
      ...preparedHistory.map(
        (m): ModelMessage => ({ role: m.role, content: m.content }) as ModelMessage
      ),
      { role: 'user', content: userContent },
    ];

    const t2 = Date.now();
    log.debug(`⏱ Model setup: ${t2 - t1}ms`);

    // Generous ceilings: reasoning models spend a large share on the <think>
    // block before visible content, so every tier gets ample headroom.
    const baseMaxOutput = profile.maxOutputTokens;

    sse.send('response_start', { message: 'Generiere Antwort...' });

    const notebookTelemetry = buildAiTelemetry('notebook-chat.respond');
    let traceId: string | null = null;
    // Wrap in a trace so propagateAttributes sets trace-level user/session —
    // AI SDK telemetry carries no metadata of its own, so without this
    // notebook traces would show empty User/Session.
    const fullText: string | null = await withLangfuseTrace(
      {
        name: 'notebook-turn',
        ...(userId && { userId }),
        ...(collectionId && { sessionId: collectionId }),
      },
      async (trace) => {
        traceId = trace.traceId ?? null;
        const text = await streamWithFallback({
          primary: primaryResolution,
          sse,
          logPrefix: '[Notebook]',
          buildStream: async (resolution) => {
            return streamForResolution({
              resolution,
              messages: aiMessages,
              maxTokens: baseMaxOutput,
              temperature: 0.2,
              sse,
              signal: abortController.signal,
              logPrefix: '[Notebook]',
              ...(notebookTelemetry && { telemetry: notebookTelemetry }),
            });
          },
        });
        // Both lanes dead → null, not a throw; the span has to say so itself.
        trace.update(
          text === null
            ? { input: userContent, level: 'ERROR', statusMessage: BOTH_LANES_FAILED }
            : { input: userContent, output: text }
        );
        return text;
      }
    );

    if (fullText === null) {
      log.debug(`⏱ Total (stream failed): ${Date.now() - t0}ms`);
      return null;
    }

    if (abortController.signal.aborted) {
      log.debug('Notebook stream aborted by client disconnect');
      if (options.closeStream !== false) sse.end();
      return null;
    }

    const t4 = Date.now();
    log.debug(`⏱ Streaming: ${t4 - t2}ms, ${fullText.length} chars`);

    // Layer 5: Output leakage detection — check if the LLM leaked system prompt fragments
    if (options.systemPromptOverride && containsPromptLeakage(fullText)) {
      log.warn('Prompt leakage detected in response, replacing with fallback');
      const fallback =
        options.noResultsMessage || 'Entschuldigung, ich konnte keine passende Antwort generieren.';
      sse.send('completion', {
        answer: fallback,
        citations: [],
        sources: [],
        allSources: [],
        metadata: { totalResults: searchContext.sortedResults.length, leakageDetected: true },
      });
      if (options.closeStream !== false) sse.end();
      // Return the fallback instead of null: the controller only persists when
      // a result comes back, so returning null left the user's message in the
      // thread without any assistant reply after reload.
      return { answer: fallback, citations: [], sources: [], question, traceId: null };
    }

    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(
      fullText,
      searchContext.referencesMap
    );
    const { cleanDraft, citations, sources, errors } = validateAndInjectCitations(
      renumberedDraft,
      newReferencesMap,
      { question }
    );
    if (errors && errors.length > 0) {
      log.warn(`[Notebook] ${errors.length} invalid citation marker(s): ${errors.join(', ')}`);
      sendChatWarning(sse, 'citation_invalid');
    }

    const allSources = searchContext.sortedResults
      .filter((_, i) => !citations.some((c) => c.index === String(i + 1)))
      .slice(0, 10)
      .map(toClientSource);

    let sourcesByCollection: SourcesByCollection | undefined;
    if (searchContext.isMulti && searchContext.effectiveCollectionIds) {
      const collectionsConfig: { [collectionId: string]: CollectionConfig } = {};
      for (const id of searchContext.effectiveCollectionIds) {
        const config = SYSTEM_COLLECTIONS[id];
        if (config) collectionsConfig[id] = { name: config.name };
      }
      sourcesByCollection = groupSourcesByCollection(
        citations,
        searchContext.sortedResults,
        collectionsConfig
      );
    }

    const t5 = Date.now();
    log.debug(`⏱ Citation processing: ${t5 - t4}ms, ${citations.length} citations`);

    sse.send('completion', {
      answer: cleanDraft,
      citations,
      sources,
      allSources,
      ...(sourcesByCollection && { sourcesByCollection }),
      metadata: {
        isMulti: searchContext.isMulti,
        collectionName: searchContext.collectionName,
        effectiveCollectionIds: searchContext.effectiveCollectionIds,
        totalResults: searchContext.sortedResults.length,
        citationsCount: citations.length,
        depth,
        queryCount: queries.length,
        ...(traceId ? { traceId } : {}),
      },
    });

    const t6 = Date.now();
    log.debug(
      `⏱ Total: ${t6 - t0}ms [${depth}] (search=${t1 - t0}, setup=${t2 - t1}, stream=${t4 - t2}, cite=${t5 - t4})`
    );
    if (options.closeStream !== false) sse.end();

    return { answer: cleanDraft, citations, sources, question, traceId };
  } catch (error: unknown) {
    log.error('Notebook stream error:', error);
    sse.send('error', {
      error: PROGRESS_MESSAGES.internalError,
      code: 'internal',
      retryable: true,
    });
    if (options.closeStream !== false) sse.end();
    return null;
  }
}
