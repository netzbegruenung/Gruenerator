/**
 * The single-pass intent loop: primary intent, then the secondary one, each in
 * its own iteration. The per-family work lives in the sibling modules; what
 * stays here is the ordering, the state threaded between iterations and the
 * source carry-over between them.
 */

import { isGroundableProse } from '@gruenerator/shared/chat-intents';

import {
  buildCitations,
  computeNode,
  imageEditNode,
  imageNode,
  summarizeNode,
} from '../../../../agents/langgraph/ChatGraph/index.js';
import { env } from '../../../../config/env.js';
import { createLogger } from '../../../../utils/logger.js';
import { needsThreadGrounding } from '../agenticLoop/routing.js';
import { extractTextContent } from '../messageHelpers.js';
import { PROGRESS_MESSAGES } from '../sseHelpers.js';
import { getRecentThreadSources } from '../threadPersistenceService.js';

import { reportMcpWithoutLoop } from './mcpWithoutLoop.js';
import { runChatHistoryBranch } from './recallBranch.js';
import { runSearchBranch } from './searchBranch.js';
import { runSharepicGeneration } from './sharepic.js';

import type {
  ChatGraphState,
  GeneratedImageResult,
  ImageAttachment,
  SearchIntent,
  SearchResult,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { PriorSharepic, SharepicVariant } from '../sharepicVariantHelpers.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

/**
 * Ground a vague continuation on the research this thread already paid for.
 *
 * A `direct` turn skips the whole retrieval block in executeIntentPipeline, so
 * "Mehr dazu bitte" after a sourced answer arrived with NO sources — and the
 * model regenerated from its own previous prose: ungrounded, uncitable, and to
 * the reader indistinguishable from research. Same helper and same reasoning
 * the agentic loop (agenticRespondService) and the artifact-creating turns
 * (createTurn) already use.
 *
 * Called AFTER the intent loop, never as a branch inside it: a `direct` turn
 * with a secondaryIntent runs two iterations, and a branch would carry sources
 * on the first only to have the real search overwrite them on the second.
 *
 * Self-limiting: a thread with no prior research returns [] and this is a
 * no-op, so the extra query only ever buys something on turns that were about
 * those sources. Never throws — an ungrounded answer beats a 500.
 *
 * Note the carried sources are re-persisted as THIS turn's searchResults, which
 * extends how far back getRecentThreadSources reaches in a long continuation
 * thread. That is a memory horizon, not a correctness bug, but it is why the
 * predicate demands an anaphor: topical continuity is the licence.
 *
 * Which verdicts may inherit the thread's earlier research: `produktion` is the
 * one that matters now: the classifier prompt sends a reference to THIS running
 * conversation there ("vorhin", "deine letzte Antwort"), which is exactly the
 * "Mehr dazu bitte" shape this carry was built for. `direct` stays because the
 * parser and the heuristic can still produce it. `greeting` is absent on
 * purpose — a greeting has nothing to ground — and so is `agentic`, which does
 * its own retrieval inside the loop and would otherwise start every turn with a
 * stale source block.
 *
 * That set is `isGroundableProse`: the `prose` disposition without `greeting`,
 * derived in `@gruenerator/shared/chat-intents`. `agentic` is excluded by the
 * disposition itself (it is `loop`, not `prose`), so only the `greeting` cut
 * needs stating — and it is stated there, once, instead of here for the third
 * time.
 */
export async function carryThreadSourcesIfNeeded(
  state: ChatGraphState,
  threadId: string | null
): Promise<ChatGraphState> {
  if (!isGroundableProse(state.intent) || state.searchResults.length > 0 || !threadId) return state;
  const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
  if (!needsThreadGrounding(lastUser ? extractTextContent(lastUser.content) : '')) return state;
  try {
    // 6, not the default 10: a continuation asks for depth on a known topic,
    // not a fresh dossier.
    const carried = await getRecentThreadSources(threadId, 6);
    if (carried.length === 0) return state;
    log.info(`[Direct] grounded on ${carried.length} prior source(s) from this thread`);
    return {
      ...state,
      searchResults: carried,
      citations: buildCitations(carried),
      sourcesCarriedFromThread: true,
    };
  } catch (err) {
    log.warn(`[Direct] source carry skipped: ${err instanceof Error ? err.message : err}`);
    return state;
  }
}

export async function executeIntentPipeline(opts: {
  classifiedState: ChatGraphState;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean>;
  imageAttachments: ImageAttachment[];
  req?: Request;
  /** Thread id for deck mints (chat_thread_canvases binding). */
  threadId?: string | null;
  /** When set, the sharepic branch refines the previous sharepic instead of starting fresh. */
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
}): Promise<{
  finalState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
}> {
  const { classifiedState, sse, forcedTool, enabledTools, imageAttachments } = opts;

  let finalState = classifiedState;
  let generatedImage: GeneratedImageResult | null = null;
  let sharepicVariants: SharepicVariant[] = [];

  // Build ordered list of intents to execute (primary first, then secondary).
  const intentsToExecute: SearchIntent[] = [classifiedState.intent];
  if (
    classifiedState.secondaryIntent &&
    classifiedState.secondaryIntent !== classifiedState.intent
  ) {
    intentsToExecute.push(classifiedState.secondaryIntent);
    log.info(`[ChatGraph] Multi-intent: ${intentsToExecute.join(' → ')}`);
  }

  // Sources already gathered by an earlier iteration of this loop, so a second
  // search branch unions instead of replacing (see the merge in searchBranch).
  let priorIntentResults: SearchResult[] = [];

  for (const currentIntent of intentsToExecute) {
    log.info(
      `[ChatGraph] Stage 2 — intent=${currentIntent}, forcedTool=${forcedTool}, enabledTools.image=${enabledTools?.['image']}`
    );
    if (currentIntent === 'image') {
      const imageToolEnabled = forcedTool || enabledTools?.['image'] !== false;
      log.info(
        `[ChatGraph] Image branch — imageToolEnabled=${imageToolEnabled}, userId=${classifiedState.agentConfig.userId}, BFL_KEY_SET=${!!env.BFL_API_KEY}`
      );
      if (imageToolEnabled) {
        sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
        const imageResult = await imageNode(finalState);
        log.info(
          `[ChatGraph] imageNode result — hasImage=${!!imageResult.generatedImage}, error=${imageResult.error || 'none'}, timeMs=${imageResult.imageTimeMs}`
        );
        finalState = { ...finalState, ...imageResult } as ChatGraphState;

        if (finalState.generatedImage) {
          generatedImage = finalState.generatedImage;
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageComplete,
            image: generatedImage,
          });
        } else if (finalState.error) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageError(finalState.error),
            error: finalState.error,
          });
        }
      }
    } else if (currentIntent === 'image_edit') {
      const imageEditToolEnabled = forcedTool || enabledTools?.['image_edit'] !== false;
      if (imageEditToolEnabled) {
        if (!imageAttachments || imageAttachments.length === 0) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageEditNoAttachment,
            error: PROGRESS_MESSAGES.imageEditNoAttachment,
          });
        } else {
          sse.send('image_start', { message: PROGRESS_MESSAGES.imageEditStart });
          const imageEditResult = await imageEditNode(finalState);
          finalState = { ...finalState, ...imageEditResult } as ChatGraphState;

          if (finalState.generatedImage) {
            generatedImage = finalState.generatedImage;
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageEditComplete,
              image: generatedImage,
            });
          } else if (finalState.error) {
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageError(finalState.error),
              error: finalState.error,
            });
          }
        }
      }
    } else if (currentIntent === 'sharepic') {
      sse.send('image_start', { message: 'Erstelle Sharepic-Varianten...' });
      sharepicVariants = await runSharepicGeneration({
        state: finalState,
        sse,
        req: opts.req,
        threadId: opts.threadId ?? null,
        ...(opts.sharepicRefinement && { sharepicRefinement: opts.sharepicRefinement }),
      });
    } else if (currentIntent === 'summary') {
      const docCount =
        (finalState.documentChatIds?.length || 0) + (finalState.documentIds?.length || 0);
      sse.send('summary_start', {
        message: PROGRESS_MESSAGES.summaryStart,
        documentCount: docCount,
      });
      const summaryResult = await summarizeNode(finalState);
      finalState = { ...finalState, ...summaryResult } as ChatGraphState;
      const summaryLength = finalState.summaryContext?.length || 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summaryLength, finalState.summaryTimeMs || 0),
        summaryLength,
        timeMs: finalState.summaryTimeMs || 0,
      });
    } else if (currentIntent === 'compute') {
      // Deterministic calculation. computeNode runs the math in plain JS and
      // stores the verified result on finalState.computedResult; the respond
      // node then injects it into the prompt so the model only phrases (never
      // recomputes) the number. The `compute` SSE event drives the inline
      // "Berechnung" card so the user sees a tool produced the figure.
      const computeResult = await computeNode(finalState);
      finalState = { ...finalState, ...computeResult } as ChatGraphState;
      if (finalState.computedResult) {
        finalState.computedResultFresh = true;
        sse.send('compute', { compute: finalState.computedResult });
      }
    } else if (currentIntent === 'chat_history') {
      finalState = await runChatHistoryBranch({
        state: finalState,
        sse,
        threadId: opts.threadId ?? null,
      });
    } else if (currentIntent === 'mcp') {
      // Die Werkzeuge des Servers gibt es nur in der Schleife. Hier zu landen
      // heisst, dass ein Notausschalter sie draussen gehalten hat — der Turn
      // sagt das, statt still aus dem Gedächtnis zu antworten. Vor dem
      // Auffangzweig, der sonst `searchNode` für einen Intent riefe, der dort
      // `break` ohne Abruf macht.
      reportMcpWithoutLoop(sse, finalState, imageAttachments.length > 0);
    } else if (
      currentIntent !== 'produktion' &&
      currentIntent !== 'direct' &&
      currentIntent !== 'greeting' &&
      currentIntent !== 'save_as_doc' &&
      currentIntent !== 'modify_doc' &&
      currentIntent !== 'modify_board'
    ) {
      const result = await runSearchBranch({
        state: finalState,
        currentIntent,
        sse,
        forcedTool,
        enabledTools,
        priorIntentResults,
      });
      finalState = result.state;
      // A deep-research engine replaced the whole turn: skip the carry-over
      // below, exactly as the `continue` in the original loop did.
      if (result.servedWholeTurn) continue;
    }

    // Carried at the END of every iteration, not inside the search branch:
    // `chat_history` (and any future branch) writes `searchResults` directly, and
    // a following scrape_url would otherwise overwrite sources this loop never
    // recorded as "prior".
    priorIntentResults = finalState.searchResults ?? [];
  }

  finalState = await carryThreadSourcesIfNeeded(finalState, opts.threadId ?? null);

  return {
    finalState,
    generatedImage,
    sharepicVariants,
  };
}
