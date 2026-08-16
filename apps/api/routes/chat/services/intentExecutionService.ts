/**
 * Intent Execution Service
 *
 * The turn handlers that are NOT plain artifact creation: recurring tasks,
 * share_doc, sharepic/social-post generation and the search/image/summary
 * pipeline. Artifact-creating turns live in createTurn.ts (choreography) and
 * artifactKinds.ts (per-kind data); the thin handlers below only name them.
 */

import { isGroundableProse } from '@gruenerator/shared/chat-intents';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';

import {
  briefGeneratorNode,
  searchNode,
  rerankNode,
  imageNode,
  imageEditNode,
  summarizeNode,
  computeNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { hasExplicitSharepicWord } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { partitionSearchErrors } from '../../../agents/langgraph/ChatGraph/types.js';
import { env } from '../../../config/env.js';
import { resolveSearchTier, resolveTier } from '../../../services/search/searchDepth.js';
import { createLogger } from '../../../utils/logger.js';

import { needsThreadGrounding } from './agenticLoop/routing.js';
import { runDeepAgentTurn } from './deepAgentTurn.js';
import { checkDeepResearchQuota, deepResearchQuotaSpentMessage } from './deepResearchQuota.js';
import { runDeepResearchTurn } from './deepResearchTurn.js';
import { runSharepicGeneration } from './intentHandlers/sharepic.js';
import { extractTextContent } from './messageHelpers.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  recallReels,
  rerankRecall,
  getThreadRecallContext,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
  formatReelsBlock,
  getSpaceRecallScope,
} from './pastChatRecallService.js';
import { looksLikeRefusal } from './refusalDetection.js';
import { withImageProxy } from './searchImagePayload.js';
import { type PriorSharepic, type SharepicVariant } from './sharepicVariantHelpers.js';
import {
  createDeferredSSE,
  PROGRESS_MESSAGES,
  sendChatWarning,
  sendSearchDegradedWarning,
} from './sseHelpers.js';
import { getKeptResearchForRetry, getRecentThreadSources } from './threadPersistenceService.js';

import type { SSEWriter, SearchResultPayload } from './sseHelpers.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ImageAttachment,
  SearchIntent,
  SearchResult,
  SocialPostPayload,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

/** Human label for a `<kind>:<id>` source key, for user- and model-facing copy. */
const SOURCE_KIND_LABELS: Record<string, string> = {
  wolke: 'Wolke-Datei',
  connect: 'verbundene Datei',
  doc_mention: 'verlinktes Dokument',
  notebook: 'Notizbuch',
};

function labelForSource(source: string): string {
  const kind = source.split(':')[0] ?? '';
  return SOURCE_KIND_LABELS[kind] ?? 'Quelle';
}

/**
 * Report sources the user explicitly attached that could not be read.
 *
 * Feeds BOTH channels from one fact: the warning is the telemetry signal, the
 * degradation note makes the answer itself say which source is missing —
 * otherwise the model quietly answers as though the file had never existed.
 */
export function reportUnavailableSources(
  sse: SSEWriter,
  state: ChatGraphState,
  sources: string[],
  needsReauth = false
): void {
  const labels = [...new Set(sources.map(labelForSource))].join(', ');
  // An expired connection is the one case the user can fix, so it gets its own
  // code and an actionable message instead of "try again later".
  if (needsReauth) {
    sendChatWarning(
      sse,
      'connect_reauth_required',
      `${labels}: Die Verbindung ist abgelaufen — bitte in den Einstellungen neu verbinden.`
    );
  } else {
    sendChatWarning(
      sse,
      'source_unavailable',
      `${labels} konnte nicht gelesen werden — die Antwort entstand ohne diese Quelle.`
    );
  }
  state.degradationNotes = [
    ...(state.degradationNotes ?? []),
    {
      code: needsReauth ? 'connect_reauth_required' : 'source_unavailable',
      modelHint: needsReauth
        ? `Die Verbindung zu dieser Quelle ist abgelaufen: ${labels}. Sag das ehrlich und weise darauf hin, dass sie in den Einstellungen neu verbunden werden muss.`
        : `Diese vom Nutzer angegebene(n) Quelle(n) konnten NICHT gelesen werden: ${labels}. Sag das ehrlich und tu nicht so, als hättest du ihren Inhalt gesehen.`,
    },
  ];
}

// The generation cores moved to artifactGeneration.ts (so the per-kind table
// can use them without an import cycle). Re-exported here because the loop's
// fat tools, the MCP server factory and the board agent flow all import them
// from this module — and because they are the seam both chat paths share.
export {
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
} from './artifactGeneration.js';

// The thin handlers naming an artifact spec, plus the two document modes, moved
// to intentHandlers/. Re-exported so the contract router keeps one import site.
export {
  generateAndCreateDocument,
  handleBoardCreation,
  handlePdfCreation,
  handlePresentationCreation,
  handleSheetCreation,
} from './intentHandlers/artifactTurns.js';
export { handleSheetEdit } from './intentHandlers/sheetEdit.js';
export { handleRecurringTaskCreation } from './intentHandlers/recurringTask.js';
export { handleShareDoc } from './intentHandlers/shareDoc.js';
export { runSharepicGeneration } from './intentHandlers/sharepic.js';

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
 */
/**
 * Which verdicts may inherit the thread's earlier research.
 *
 * `produktion` is the one that matters now: the classifier prompt sends a
 * reference to THIS running conversation there ("vorhin", "deine letzte
 * Antwort"), which is exactly the "Mehr dazu bitte" shape this carry was built
 * for. `direct` stays because the parser and the heuristic can still produce
 * it. `greeting` is absent on purpose — a greeting has nothing to ground — and
 * so is `agentic`, which does its own retrieval inside the loop and would
 * otherwise start every turn with a stale source block.
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
  /** Text half of the EXPERIMENTAL social_post intent; null otherwise. */
  socialPost: SocialPostPayload | null;
  /** The text model refused: no post, no sharepic, and no success copy. */
  socialPostRefused: boolean;
  /** Whether that refusal is backed by a POLICY decline (the sharepic half
   *  declined too) rather than only by the text half failing. Drives which
   *  explanation the turn's answer gives — see the gate for the reasoning. */
  socialPostRefusalIsPolicy: boolean;
}> {
  const { classifiedState, sse, forcedTool, enabledTools, imageAttachments } = opts;

  let finalState = classifiedState;
  let generatedImage: GeneratedImageResult | null = null;
  let sharepicVariants: SharepicVariant[] = [];
  let socialPost: SocialPostPayload | null = null;
  let socialPostRefused = false;
  let socialPostRefusalIsPolicy = false;

  // Build ordered list of intents to execute (primary first, then secondary).
  // social_post handles pasted URLs inline BEFORE text generation — a
  // trailing scrape_url iteration would crawl after the post is written.
  const intentsToExecute: SearchIntent[] = [classifiedState.intent];
  if (
    classifiedState.secondaryIntent &&
    classifiedState.secondaryIntent !== classifiedState.intent &&
    !(classifiedState.intent === 'social_post' && classifiedState.secondaryIntent === 'scrape_url')
  ) {
    intentsToExecute.push(classifiedState.secondaryIntent);
    log.info(`[ChatGraph] Multi-intent: ${intentsToExecute.join(' → ')}`);
  }

  // Sources already gathered by an earlier iteration of this loop, so a second
  // search branch unions instead of replacing (see the merge below).
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
    } else if (currentIntent === 'social_post') {
      // A post is TEXT ONLY unless the user named a sharepic ("Post mit
      // Sharepic"). Producing a branded graphic for every "schreib einen
      // Insta-Post zu X" was the largest source of sharepics nobody asked for.
      // When a sharepic IS wanted, both halves run in parallel and each emits
      // its SSE event as soon as it resolves (text usually lands first, so the
      // card shows it while thumbnails render).
      //
      // Read from finalState.messages, not from the router's
      // lastUserTextNoMentions: the resume path appends the answered
      // clarification as a NEW user message (resumePipeline), so the original
      // "mit Sharepic" wording is still the last user turn there and that path
      // needs no separate handling.
      const sharepicToolAllowed = forcedTool || enabledTools?.['sharepic'] !== false;
      const lastUserMsg = [...finalState.messages].reverse().find((m) => m.role === 'user');
      const wantsSharepic =
        sharepicToolAllowed &&
        hasExplicitSharepicWord(lastUserMsg ? extractTextContent(lastUserMsg.content) : '');
      sse.send('image_start', {
        message: wantsSharepic ? 'Texte und gestalte deinen Post...' : 'Texte deinen Post...',
      });

      // The sharepic half streams `sharepic_complete` itself, so its output is
      // buffered until the text half is known: a graphic must never ship when
      // the text model refused the request (live: an invented Kickl quote with
      // an invented ORF source rendered in party design while the text said
      // "I'm sorry, but I can't help with that"). Buffering keeps both halves
      // parallel — the gate costs no latency, only revocability.
      const sharepicBuffer = createDeferredSSE();
      const postBuffer = createDeferredSSE();
      const sharepicHalf: Promise<SharepicVariant[]> = wantsSharepic
        ? runSharepicGeneration({
            state: finalState,
            sse,
            req: opts.req,
            threadId: opts.threadId ?? null,
            emitTo: sharepicBuffer,
          })
        : Promise.resolve([]);

      const stateForText = finalState;
      const textHalf: Promise<{
        state: ChatGraphState;
        post: SocialPostPayload;
      }> = (async () => {
        // Pasted URLs must ground the text ("schreib einen Tweet zu <URL>"),
        // so crawl them HERE, before generation — the secondary-intent loop
        // iteration would run only after the text already exists (it is
        // skipped for social_post, see intentsToExecute above).
        let urlContext: ChatGraphState['searchResults'] = [];
        if ((stateForText.detectedUrls?.length ?? 0) > 0) {
          try {
            const scrape = await searchNode({
              ...stateForText,
              intent: 'scrape_url',
            } as ChatGraphState);
            urlContext = scrape.searchResults ?? [];
          } catch (error) {
            log.warn(`[ChatGraph] social_post URL crawl failed: ${error}`);
          }
        }
        // Ground the text on real posts (same retrieval as `examples`) —
        // unless the agent/user disabled the examples tool; the composer
        // prompt handles zero examples ("Keine Vorlagen verfügbar"). A
        // failed search degrades the same way.
        let textState = stateForText;
        const examplesEnabled = forcedTool || enabledTools?.['examples'] !== false;
        if (examplesEnabled) {
          try {
            const searchResult = await searchNode(stateForText);
            textState = { ...stateForText, ...searchResult } as ChatGraphState;
          } catch (error) {
            log.warn(`[ChatGraph] social_post examples search failed: ${error}`);
          }
        }
        if (urlContext.length > 0) {
          // Keep crawled pages on state too so citations persist with the turn.
          textState = {
            ...textState,
            searchResults: [...(textState.searchResults ?? []), ...urlContext],
            citations: [...(textState.citations ?? []), ...buildCitations(urlContext)],
          } as ChatGraphState;
        }
        const { generateSocialPostText } = await import('./socialPostService.js');
        const post = await generateSocialPostText({
          state: textState,
          urlContext,
          ...(opts.req && { req: opts.req }),
        });
        postBuffer.send('social_post_complete', {
          message: `${post.platform === 'generic' ? 'Social-Media' : post.platform}-Post erstellt`,
          post,
        });
        return { state: textState, post };
      })();

      const [variantsSettled, textSettled] = await Promise.allSettled([sharepicHalf, textHalf]);

      // The gate: a refusal from the text model invalidates the whole turn, not
      // just its own half. Both buffers are dropped so no graphic, no download
      // button and no success copy survive the refusal.
      const refusedText =
        textSettled.status === 'fulfilled' && looksLikeRefusal(textSettled.value.post.text);
      // WHY the text model declined is not something `looksLikeRefusal` can
      // tell us — it only sees that it declined. The sharepic half ran the SAME
      // request through its own ABLEHNUNG channel, so its outcome is the one
      // piece of evidence available: both halves declining is a policy problem,
      // while a text-only decline beside working variants is usually a broken
      // task (live: an unresolvable "Jetzt eine Version davon auf Englisch."
      // made the composer answer "ich kann keinen Post erstellen …", which was
      // then shown to the user as a refusal about FABRICATED QUOTES — a reason
      // that had nothing to do with the request).
      //
      // The gate itself does NOT change: both halves are discarded either way,
      // because a text refusal beside a rendered sharepic is exactly the
      // disinformation case this was built for. Only the explanation adapts to
      // what is actually known.
      //
      // No sharepic half ⇒ no second opinion on the same request ⇒ no evidence
      // that this was a policy decision. `wantsSharepic` is load-bearing here:
      // without it a text-only post would report EVERY refusal as a fabricated
      // quote, which is precisely the false accusation described above.
      const sharepicAlsoDeclined =
        wantsSharepic &&
        (variantsSettled.status !== 'fulfilled' || variantsSettled.value.length === 0);
      if (refusedText) {
        log.warn(
          `[ChatGraph] social_post: text model refused — discarding sharepic variants and post ` +
            `(sharepicAlsoDeclined=${sharepicAlsoDeclined})`
        );
        sharepicBuffer.discard();
        postBuffer.discard();
        socialPostRefused = true;
        socialPostRefusalIsPolicy = sharepicAlsoDeclined;
        sse.send('social_post_complete', {
          message: sharepicAlsoDeclined ? 'Anfrage abgelehnt' : 'Post nicht erstellt',
          error: sharepicAlsoDeclined
            ? 'Diese Anfrage kann ich nicht umsetzen — dabei entstünde ein erfundenes Zitat oder eine irreführende Aussage im Namen der Partei.'
            : 'Daraus konnte ich keinen Post erzeugen. Sag mir bitte konkret, worum es gehen soll — oder worauf du dich beziehst.',
        });
      } else {
        sharepicBuffer.flush(sse);
        postBuffer.flush(sse);
      }

      if (variantsSettled.status === 'fulfilled') {
        sharepicVariants = refusedText ? [] : variantsSettled.value;
      } else if (!refusedText) {
        // Mirror the text half below: without this the sharepic simply never
        // arrived and the turn reported success with only the post text.
        log.error('[ChatGraph] social_post sharepic generation failed:', variantsSettled.reason);
        sse.send('sharepic_complete', {
          message: 'Sharepic konnte nicht erstellt werden',
          variants: [],
          error: 'Das Sharepic konnte nicht erstellt werden — der Text steht trotzdem bereit.',
        });
      }
      if (textSettled.status === 'fulfilled') {
        // A refusal is not a post: leaving it on state would persist it as one
        // and make the router's confirmation line promise a post that isn't there.
        socialPost = refusedText ? null : textSettled.value.post;
        // Keep the examples retrieval on state so persistence/citations work
        // like the examples flow.
        finalState = {
          ...textSettled.value.state,
          ...(socialPost && { socialPostResult: socialPost }),
        } as ChatGraphState;
      } else {
        log.error('[ChatGraph] social_post text generation failed:', textSettled.reason);
        sse.send('social_post_complete', {
          message: 'Post-Text konnte nicht erstellt werden',
          error: textSettled.reason instanceof Error ? textSettled.reason.message : 'Unknown error',
        });
      }
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
      // Recall the user's own past work — chat threads (deep-reading the top
      // match), office documents (docs/presentations/sheets) and reels
      // (subtitled videos, matched on their spoken transcript). Runs its own
      // retrieval (not searchNode, which targets party documents/web).
      const userId = finalState.agentConfig.userId;
      if (userId) {
        sse.send('search_start', { message: 'Durchsuche frühere Inhalte…' });
        const query =
          finalState.searchQuery ||
          (finalState.messages.length
            ? (extractTextContent(
                finalState.messages[finalState.messages.length - 1].content
              ) as string)
            : '');
        const dateFrom = finalState.detectedFilters?.date_from;
        const dateTo = finalState.detectedFilters?.date_to;
        // Space scope: restrict recall to the current Space's chats + roster.
        // null ist hier der definierte Normalfall — ein Thread ohne Space
        // liefert ihn ohnehin.
        const spaceScope = opts.threadId
          ? // swallow-ok: scheitert die Einengung, sucht der Recall ungescopet weiter statt den Turn abzubrechen
            await getSpaceRecallScope(opts.threadId, userId).catch(() => null)
          : null;
        const [rawChats, rawOfficeDocs, rawReels] = await Promise.all([
          recallPastChats(userId, query, {
            limit: 5,
            ...(opts.threadId != null && { excludeThreadId: opts.threadId }),
            ...(dateFrom && { startDate: new Date(`${dateFrom}T00:00:00.000Z`) }),
            // Das Fenster ist INKLUSIV erzeugt (`parseRelativeDateRange`), die
            // SQL-Klausel ist `created_at <= $n`, und `new Date('2026-07-30')`
            // ist Mitternacht. Beides zusammen machte aus jedem Ein-Tages-Fenster
            // („gestern") einen einzigen Zeitpunkt: nur eine Nachricht, die
            // exakt um 00:00:00 UTC geschrieben wurde, konnte noch treffen — und
            // „letzte Woche" verlor den ganzen Sonntag. Genau die „0 Treffer →
            // keine Quellen gefunden"-Antwort, gegen die diese Stufe gebaut ist.
            ...(dateTo && { endDate: new Date(`${dateTo}T23:59:59.999Z`) }),
            ...(spaceScope && { threadIds: spaceScope.threadIds }),
          }),
          // BEKANNTE LÜCKE: das Datumsfenster geht nur an den Chat-Recall.
          // `searchOfficeContent`/`searchReels` nehmen keine Datumsparameter, ein
          // Durchreichen wäre also eine Änderung an beiden Suchdiensten und ihrem
          // SQL — eigener Schnitt. Folge heute: „meine Dokumente vom letzten
          // Monat" filtert die CHATS auf den Monat, die Dokumente und Reels aber
          // nicht. Das untertreibt nie (es fehlt kein Treffer), es übertreibt.
          recallOfficeDocuments(userId, query, 5),
          recallReels(userId, query, 5),
        ]);
        // Cross-source rerank so the most relevant few survive across chats +
        // office content + reels, rather than 5 of each.
        const {
          chats: hits,
          officeDocs,
          reels,
        } = await rerankRecall(query, rawChats, rawOfficeDocs, 6, rawReels);

        const deepRead = hits[0] ? await getThreadRecallContext(hits[0].threadId, userId) : null;

        const searchResults: SearchResult[] = [
          ...hits.map((h) => ({
            source: 'chat_history',
            title: h.threadTitle ?? 'Unbenannter Chat',
            content: h.snippet,
            url: `/chat/${h.threadSlugSuffix ? buildChatThreadSlug(h.threadTitle, h.threadSlugSuffix) : h.threadId}`,
          })),
          ...officeDocs.map((d) => ({
            source: 'office_document',
            title: d.title ?? 'Unbenanntes Dokument',
            content: d.snippet || d.kind,
            url: d.url,
          })),
          ...reels.map((r) => ({
            source: 'reel',
            title: r.title,
            content: r.snippet || 'Reel',
            url: r.url,
          })),
        ];

        const contextBlocks = [
          spaceScope?.rosterBlock ?? '',
          hits.length ? formatPastChatsBlock(hits, deepRead) : '',
          formatOfficeDocsBlock(officeDocs),
          formatReelsBlock(reels),
        ].filter(Boolean);
        finalState = {
          ...finalState,
          searchResults,
          chatHistoryContext: contextBlocks.length ? contextBlocks.join('\n\n') : null,
        } as ChatGraphState;

        const payloadResults: SearchResultPayload[] = searchResults.map((r) => ({
          source: r.source,
          title: r.title,
          content: r.content,
          ...(r.url != null && { url: r.url }),
        }));
        sse.send('search_complete', {
          message: PROGRESS_MESSAGES.searchComplete(searchResults.length),
          resultCount: searchResults.length,
          results: payloadResults,
        });
      }
    } else if (
      currentIntent !== 'produktion' &&
      currentIntent !== 'direct' &&
      currentIntent !== 'greeting' &&
      currentIntent !== 'save_as_doc' &&
      currentIntent !== 'modify_doc' &&
      currentIntent !== 'modify_board'
    ) {
      const toolEnabled = forcedTool || enabledTools?.[currentIntent] !== false;
      if (toolEnabled) {
        // `intent` must follow the LOOP, not the classifier's primary verdict.
        // searchNode switches on `state.intent`, and the state threaded through
        // here still carried the primary — so a secondary search intent ran the
        // PRIMARY branch a second time. Live: "<tagesschau-URL> zusammenfassen"
        // classified web → scrape_url and issued the identical Linkup search
        // twice (paid, ~2 s each) while the pasted page was never crawled.
        let searchInputState = { ...finalState, intent: currentIntent } as ChatGraphState;

        // @deepresearch has two engines, tried in this order. Both replace BOTH
        // halves of the turn — retrieval and synthesis — and must therefore skip
        // everything below, not just the search node: reranking reorders
        // `searchResults`, and a finished answer's [N] point at the original
        // order. For both, `null` means "not served" (no key, failed run) and
        // falls through to the next one, with the warning already sent.

        // The shared daily allowance is settled HERE, once, for both engines:
        // they meter through one Redis key, and a per-engine limit against a
        // shared key made the verdict depend on which engine happened to run.
        let allowanceGone = false;
        const deepUserId = searchInputState.agentConfig?.userId ?? '';
        // No userId means no meter — both engines refuse on their own for that
        // reason, and asking the counter would fail closed and mis-report it as
        // a spent allowance.
        if (searchInputState.deepResearchRequested === true && deepUserId.length > 0) {
          const quota = await checkDeepResearchQuota(deepUserId);
          if (!quota.canResearch) {
            sendChatWarning(sse, 'deep_research_quota_spent', deepResearchQuotaSpentMessage(quota));
            allowanceGone = true;
          }
        }

        // First the agent, whenever it can run at all: it answers with a DOCUMENT
        // rather than a dossier, so on success there is nothing to rerank and no
        // source list to emit — only the short summary it put in
        // `deepResearchAnswer`.
        if (searchInputState.deepResearchRequested === true && !allowanceGone) {
          const report = await runDeepAgentTurn({ state: searchInputState, sse });
          if (report) {
            finalState = { ...searchInputState, ...report } as ChatGraphState;
            continue;
          }
        }

        // Then Linkup's one-shot dossier, the path that always existed.
        if (searchInputState.deepResearchRequested === true && !allowanceGone) {
          const dossier = await runDeepResearchTurn({ state: searchInputState, sse });
          if (dossier) {
            finalState = { ...searchInputState, ...dossier } as ChatGraphState;
            sse.send('search_complete', {
              message: PROGRESS_MESSAGES.searchComplete(finalState.searchResults?.length ?? 0),
              resultCount: finalState.searchResults?.length ?? 0,
              results: (finalState.searchResults ?? []).slice(0, 10).map((r) => {
                const result: SearchResultPayload = {
                  source: r.source,
                  title: r.title,
                  content: r.content,
                };
                if (r.url != null) result.url = r.url;
                return result;
              }),
            });
            continue;
          }
        }

        // A retry of a research turn whose GENERATION failed: the sources are
        // already on the thread. Re-running Linkup costs ~17s and a paid call
        // to answer the identical question a second time (observed live, 36s
        // after the sources had been persisted). Checked before the brief
        // generator so the whole retrieval half is skipped, not just the search.
        const reused =
          currentIntent === 'research' && finalState.threadId
            ? // swallow-ok: reine Ersparnis — scheitert sie, läuft die Recherche normal durch, teurer aber richtig
              await getKeptResearchForRetry(
                finalState.threadId,
                finalState.searchQuery ?? ''
              ).catch(() => null)
            : null;
        if (reused) {
          log.info(
            `[Research] Reusing ${reused.searchResults.length} source(s) kept from the failed attempt — skipping the repeat Linkup run`
          );
          searchInputState = {
            ...finalState,
            searchResults: reused.searchResults,
            citations: buildCitations(reused.searchResults),
          } as ChatGraphState;
        }

        const willGenerateBrief =
          !reused &&
          ['complex', 'moderate'].includes(finalState.complexity) &&
          currentIntent === 'research';
        const briefStepId = willGenerateBrief ? `brief_${Date.now()}` : null;
        if (willGenerateBrief && briefStepId) {
          // brief generator is a silent LLM call (~1–3s); ping so the UI doesn't
          // sit on the stale "intent" message during this window.
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'in_progress',
          });
          const briefResult = await briefGeneratorNode(finalState);
          searchInputState = { ...finalState, ...briefResult } as ChatGraphState;
          // The flag was set all along but only read by runChatGraph, which has
          // no callers — so a deep-research turn silently degraded to a flat
          // search while the progress copy still promised deep research.
          if (searchInputState.briefGenerationFailed) {
            sendChatWarning(sse, 'research_plan_failed');
          }
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'completed',
          });
        }

        // The progress line now follows the TIER, not the intent: "recherchiere"
        // no longer means a different engine, so promising "dauert 15–20s" on
        // every such turn would be a lie about a search that takes two.
        const searchTier = resolveSearchTier({
          intent: currentIntent,
          explicitDeep: searchInputState.explicitDeepRequest ?? false,
        });
        if (!reused) {
          const baseProgress =
            searchTier === 'standard'
              ? PROGRESS_MESSAGES.searchStart
              : resolveTier(searchTier).progress;
          // A site scope must be VISIBLE. It was extracted heuristically from the
          // user's wording, so a wrong read has to be recognisable as such —
          // otherwise the user sees results missing and has no way to tell that
          // the search was narrowed at all. Named in the progress line rather than
          // a new event field, because that line is already rendered everywhere.
          const scopeDomains = searchInputState.webSiteScope?.include ?? [];
          sse.send('search_start', {
            message:
              scopeDomains.length > 0
                ? `${baseProgress.replace(/[…\s]+$/, '')} — nur auf ${scopeDomains.join(', ')}…`
                : baseProgress,
            ...(finalState.subQueries?.length && { subQueries: finalState.subQueries }),
          });
          if (searchTier !== 'standard') {
            searchInputState = {
              ...searchInputState,
              onResearchProgress: (message: string) => {
                sse.send('search_start', { message });
              },
            } as ChatGraphState;
          }
        }
        // Reused sources ARE the search result — running the node would issue the
        // very Linkup call this branch exists to avoid.
        const searchResult = reused ? {} : await searchNode(searchInputState);
        finalState = { ...searchInputState, ...searchResult } as ChatGraphState;
        // searchNode REPLACES `searchResults`. With the loop now running two
        // genuinely different branches (e.g. web → scrape_url), the second one
        // would drop the first one's sources on the floor. Union them, this
        // iteration's results first (the secondary is the more specific ask —
        // a pasted page beats hits the engine merely found). Deduped by URL;
        // rerank re-orders right below.
        //
        // The guard reads the PRIOR results only, deliberately: an empty second
        // branch (crawl blocked by robots.txt, zero hits) still overwrites
        // `searchResults` with [] one line above, so also requiring the CURRENT
        // branch to be non-empty would wipe the first branch's sources — the
        // very failure this union exists to prevent, with the roles swapped.
        if (priorIntentResults.length > 0) {
          const merged = [...(finalState.searchResults ?? []), ...priorIntentResults];
          const seen = new Set<string>();
          const deduped = merged.filter((r) => {
            const key = r.url ?? `${r.source}:${r.title}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          finalState = {
            ...finalState,
            searchResults: deduped,
            citations: buildCitations(deduped),
          } as ChatGraphState;
        }

        if (finalState.searchResults?.length > 2) {
          const rerankStepId = `rerank_${Date.now()}`;
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'in_progress',
          });
          const rerankResult = await rerankNode(finalState);
          finalState = { ...finalState, ...rerankResult } as ChatGraphState;
          if (finalState.searchResults.length > 0) {
            finalState.citations = buildCitations(finalState.searchResults);
          }
          // Same dead-flag story as briefGenerationFailed: without reranking the
          // model grounds on input order, so the top sources may be the weakest.
          if (finalState.rerankFailed) sendChatWarning(sse, 'rerank_degraded');
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'completed',
          });
        }

        const resultCount = finalState.searchResults?.length || 0;
        const payloadResults =
          finalState.searchResults?.slice(0, 10).map((r) => {
            const result: SearchResultPayload = {
              source: r.source,
              title: r.title,
              content: r.content,
            };
            if (r.url != null) result.url = r.url;
            if (r.relevance != null) result.relevance = r.relevance;
            return result;
          }) || [];
        // Degraded search (Qdrant/web source unreachable) must be
        // distinguishable from a genuine zero-hit — both for the user
        // (warning toast + status copy) and for monitoring.
        const {
          coreDegraded: searchDegraded,
          unavailableSources,
          needsReauth,
        } = partitionSearchErrors(finalState.searchErrors);
        if (searchDegraded) sendSearchDegradedWarning(sse, resultCount);
        // A file the user explicitly attached or @-mentioned that could not be
        // read. These were collected but filtered away by the availability
        // predicate, so the answer simply omitted the source without a word.
        if (unavailableSources.length > 0) {
          reportUnavailableSources(sse, finalState, unavailableSources, needsReauth);
        }
        sse.send('search_complete', {
          message:
            searchDegraded && resultCount === 0
              ? PROGRESS_MESSAGES.searchDegraded
              : PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results: payloadResults,
          // Only present on a turn that explicitly asked for images. Travels
          // beside `results`, never inside it — an image has no text, so as a
          // source it would be a numbered citation with an empty snippet.
          ...(finalState.webImageResults?.length
            ? { images: finalState.webImageResults.map(withImageProxy) }
            : {}),
          ...((currentIntent === 'examples' || currentIntent === 'pressemitteilung_examples') &&
          finalState.examplesResult
            ? { examplesResult: finalState.examplesResult }
            : {}),
        });
      }
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
    socialPost,
    socialPostRefused,
    socialPostRefusalIsPolicy,
  };
}
