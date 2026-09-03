import {
  triggerDocEditSchema,
  triggerBoardActionSchema,
  editorOperationsEventSchema,
  isCanvasTemplateType,
  chatStreamEventSchemas,
  type ChatErrorEventPayload,
  type SocialPostPayload,
  type BahnPayload,
  type SharepicUpdatedEvent,
} from '@gruenerator/contracts';
import { subtypeToArtifactKind } from '@gruenerator/shared/docs';

import { coerceSharepicVariants } from '../../hooks/useChatGraphStream';
import { notifyError, notifyWarning } from '../../lib/notify';
import { pickStageLabels } from '../../lib/progressLabels';
import { parseSSELine } from '../../lib/sseParser';
import { TOOL_APPROVAL_OPTIONS } from '../../lib/toolApproval';
import {
  ARTIFACT_STAGE_INTENTS,
  ARTIFACT_TOOL_NAMES,
  INTENT_TO_TOOL,
  DEEP_TOOL_MAP,
  formatNamespacedToolLabel,
} from '../../lib/toolMappings';
import {
  canAutoOpenArtifactPanel,
  useArtifactLiveStore,
  type CodeArtifact,
  type ResearchLogStep,
} from '../../stores/artifactLiveStore';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useAgentStore } from '../../stores/chatStore';
import { useReelLiveStore } from '../../stores/reelLiveStore';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../../stores/socialPostLiveStore';
import { ChatStreamError } from '../streamErrorMessage';

import type {
  GrueneratorAdapterCallbacks,
  GrueneratorMessageMetadata,
  ToolCallPart,
  SourcePart,
  StreamOutcome,
} from './types';
import type {
  ProgressStage,
  SearchIntent,
  GeneratedImage,
  ChatProgress,
  Citation,
  FallbackInfo,
  SearchResult,
  SearchImage,
  StreamMetadata,
  ProgressStep,
  ChartData,
  ComputeData,
  SharepicData,
} from '../../hooks/useChatGraphStream';
import type {
  ConfirmActionData,
  DocumentCreatedData,
  ReelPickerData,
  ReelProcessingData,
} from '../../types/messageMetadata';
import type { ChatModelRunResult } from '@assistant-ui/react';

/**
 * Verdicts under which nothing is looked up — the progress bar goes straight to
 * "generating". `direct` is kept for threads and older backends that still send
 * it; `agentic` is absent because the loop DOES retrieve.
 *
 * `compute` belongs here for the same reason and was missing: computeNode runs
 * a plan through the arithmetic engine and touches no retrieval at all. Falling
 * through to the default put "Durchsuche …" over a turn that searched nothing —
 * reported twice as the product looking things up it had been told not to.
 */
const NO_RETRIEVAL_STAGE_INTENTS: ReadonlySet<string> = new Set([
  'produktion',
  'direct',
  'greeting',
  'compute',
]);

/** Display titles for agentic loop steps (tool_step_start events). */
const TOOL_STEP_TITLES: Record<string, string> = {
  read_sharepic_state: 'Lese aktuellen Zustand…',
  apply_sharepic_ops: 'Wende Änderung an…',
  restore_version: 'Stelle Version wieder her…',
  rezept_laden: 'Lade Schreibvorgaben…',
};

export async function* parseSSEStream(
  response: Response,
  callbacks: GrueneratorAdapterCallbacks,
  outcome: StreamOutcome,
  agentInfo?: { agentId: string; agentMention?: string },
  // Tool-call parts from an earlier stream of the SAME run (client-tool
  // resume): pre-seeded so the run_python card stays visible while the
  // resumed answer streams.
  carryOver?: { toolCalls: ToolCallPart[] }
): AsyncGenerator<ChatModelRunResult, void> {
  const reader = response.body?.getReader();

  // React Native's fetch doesn't support ReadableStream — read full text as fallback
  const fullText = !reader ? await response.text() : null;

  const decoder = new TextDecoder();
  let buffer = '';
  const currentEvent = { type: '' };
  // Stufe 2 (Interleaving): text and tool cards live in ONE ordered list so
  // prose and cards render in true event order — text→card→text — instead of
  // "all cards, then one text block". `allToolCalls`/`activeToolCall`/
  // `toolStepsById` below are kept as bookkeeping for the legacy result-stamping
  // paths and mirrored into `orderedContent` via orderPushCard/orderReplaceCard.
  type TextSegment = { type: 'text'; text: string };
  const orderedContent: Array<TextSegment | ToolCallPart> = [];
  let currentTextSegment: TextSegment | null = null;
  // One blob for the whole turn (the dropdown reads it as one text). A blank
  // line is inserted at every step boundary, otherwise the agentic loop's later
  // thinking is glued onto the previous step's last sentence mid-word.
  let accumulatedReasoning = '';
  function breakReasoningBlock(): void {
    if (accumulatedReasoning.length > 0 && !accumulatedReasoning.endsWith('\n\n')) {
      accumulatedReasoning += '\n\n';
    }
  }
  // Themed progress labels — picked once per turn, stable for the whole stream.
  const stageLabels = pickStageLabels();
  let currentProgress: ChatProgress = {
    stage: 'classifying',
    message: stageLabels.classifying,
  };
  const progressSteps: ProgressStep[] = [
    { stage: 'classifying', label: stageLabels.classifying, status: 'in-progress' },
  ];

  /**
   * @param key Identität des Schritts, wenn die Stufe sie nicht trägt. Ein
   *   Pipeline-Nachschritt läuft unter derselben Stufe wie ein echtes
   *   Such-Werkzeug; ohne eigenen Schlüssel überschriebe sein Titel rückwirkend
   *   dessen Label, und die Herkunft des Suchschritts wäre aus der fertigen
   *   Liste nicht mehr ablesbar.
   */
  function transitionStep(newStage: ProgressStage, labelOverride?: string, key?: string) {
    // Mark current in-progress step as completed
    for (const step of progressSteps) {
      if (step.status === 'in-progress') {
        step.status = 'completed';
        step.completedAt = Date.now();
      }
    }
    // Add new step if it has a label and isn't 'complete'/'error'/'idle'
    const label = labelOverride || stageLabels[newStage];
    if (label && newStage !== 'complete' && newStage !== 'error' && newStage !== 'idle') {
      const same = (s: ProgressStep): boolean => (s.key ?? s.stage) === (key ?? newStage);
      const existing = progressSteps.find(same);
      if (!existing) {
        progressSteps.push({ stage: newStage, label, status: 'in-progress', ...(key && { key }) });
      } else {
        existing.status = 'in-progress';
        // Ein wiederbelebter Schritt trägt sonst das Label seines ersten Laufs.
        // Nennt der Aufrufer eines, ist genau das die Information: die beiden
        // Nachschritte unterscheiden sich NUR im Titel.
        if (labelOverride) existing.label = labelOverride;
      }
    }
    if (newStage === 'complete') {
      for (const step of progressSteps) {
        if (step.status !== 'failed') {
          step.status = 'completed';
          step.completedAt ??= Date.now();
        }
      }
    }
    if (newStage === 'error') {
      for (const step of progressSteps) {
        if (step.status === 'in-progress') {
          step.status = 'failed';
        }
      }
    }
  }

  let receivedSearchResults: SearchResult[] = [];
  let receivedSearchImages: SearchImage[] = [];
  let receivedCitations: Citation[] = [];
  let receivedImage: GeneratedImage | null = null;
  let receivedSharepicData: SharepicData | null = null;
  let receivedSocialPostData: SocialPostPayload | null = null;
  let receivedChartData: ChartData | null = null;
  let receivedArtifactData: CodeArtifact | null = null;
  let receivedComputeData: ComputeData | null = null;
  let receivedBahnData: BahnPayload | null = null;
  let receivedFollowUpSuggestions: string[] = [];
  let receivedMetadata: StreamMetadata | null = null;
  // Notebook turns end on `completion`, never on `done`, so their trace id
  // arrives outside the metadata envelope the chat paths use.
  let receivedTraceId: string | null = null;
  let receivedConfirmAction: ConfirmActionData | null = null;
  let receivedCreatedDocument: DocumentCreatedData | null = null;
  let receivedReelProcessing: ReelProcessingData | null = null;
  let receivedReelPicker: ReelPickerData | null = null;
  let evidenceWeakAccum: string | null = null;
  let activeToolCall: ToolCallPart | null = null;
  const allToolCalls: ToolCallPart[] = [...(carryOver?.toolCalls ?? [])];
  // Agentic tool-loop steps, keyed by stepId. The loop can run several tools in
  // ONE model step (parallel tool calls), so their start/result events
  // interleave — a single `activeToolCall` would drop all but the last. Each
  // step is pushed on `tool_step_start` and updated in place on
  // `tool_step_result`.
  const toolStepsById = new Map<string, ToolCallPart>();
  // Split-gather narration sentences seen since the last tool card was pushed.
  // Surfaced live as `progress.pendingNarration` (paced status line) and, when
  // the server omits `narration` on tool_step_start (older API), drained here to
  // stamp the card client-side — same ordering rule as the server path, so an
  // old server + new client still gets live narration (just not on reload).
  let pendingNarration: string[] = [];
  let interruptPending = false;
  // client_tool interrupt (auto-executed by the ModelAdapter): unlike a
  // clarification it must NOT flip the message to requires-action — the same
  // run() continues with the executed result via the resume endpoint.
  let clientToolPending = false;
  // Whether the backend sent a terminal event. A stream that ends without one
  // is a failure, not a short answer (see the tail of this function).
  let sawTerminalEvent = false;
  let consecutiveParseErrors = 0;
  let lastYieldTime = 0;
  const YIELD_INTERVAL = 50; // ms — max 20 yields/sec, matches NotebookModelAdapter
  const MAX_CONSECUTIVE_PARSE_ERRORS = 5;

  // Push a NEW card into orderedContent (event order) and break the text run.
  // parentId run-grouping (for Stufe 3's collapsed summary row): a card that
  // directly follows another card shares its parentId (same contiguous run); a
  // card at the start or right after a text segment begins a new run whose
  // parentId is its own toolCallId.
  function orderPushCard(card: ToolCallPart): void {
    const prev = orderedContent[orderedContent.length - 1];
    card.parentId = prev && prev.type === 'tool-call' ? prev.parentId : card.toolCallId;
    orderedContent.push(card);
    currentTextSegment = null;
  }

  // Replace a card in place (matched by toolCallId) so a result-stamped rebuild
  // lands at its original position; the spread at each call site carries parentId
  // forward. No-op if the card was never ordered (defensive).
  function orderReplaceCard(card: ToolCallPart): void {
    const idx = orderedContent.findIndex(
      (el) => el.type === 'tool-call' && el.toolCallId === card.toolCallId
    );
    if (idx >= 0) orderedContent[idx] = card;
  }

  function appendText(delta: string): void {
    if (currentTextSegment) {
      currentTextSegment.text += delta;
    } else {
      currentTextSegment = { type: 'text', text: delta };
      orderedContent.push(currentTextSegment);
    }
  }

  // Legacy carryOver cards (client-tool resume) never interleave with text_delta
  // — seed them up front so they precede any streamed prose (cards-first, as before).
  for (const tc of allToolCalls) orderPushCard(tc);

  function buildResult(): ChatModelRunResult {
    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'reasoning'; text: string }
      | ToolCallPart
      | SourcePart
    > = [];

    if (accumulatedReasoning) {
      content.push({ type: 'reasoning' as const, text: accumulatedReasoning });
    }

    // Ordered text segments + tool cards in true event order. Normalize
    // [cite:N] → [N] PER text segment before emitting, so CitationMarkdownText's
    // placeholder-badge layer (citationProcessing.ts:25) renders inline-reserved
    // boxes during streaming and the SearchGraph "[cite:N]" markers never appear
    // as plain text.
    for (const el of orderedContent) {
      if (el.type === 'text') {
        content.push({ type: 'text' as const, text: el.text.replace(/\[cite:(\d+)\]/g, '[$1]') });
      } else {
        content.push(el);
      }
    }

    const firstCard = orderedContent.find((el): el is ToolCallPart => el.type === 'tool-call');
    const groupId = activeToolCall ? activeToolCall.toolCallId : firstCard?.toolCallId;
    for (const citation of receivedCitations) {
      if (citation.url) {
        content.push({
          type: 'source' as const,
          sourceType: 'url' as const,
          id: `source-${citation.id}`,
          url: citation.url,
          title: citation.title || undefined,
          parentId: groupId,
        });
      }
    }

    // assistant-ui expects a trailing text part. When the last ordered element
    // is a card (or nothing has streamed yet), append an empty text tail so the
    // message always ends on text — matching the pre-interleaving behaviour,
    // which emitted exactly one (possibly empty) text part at the end.
    const last = orderedContent[orderedContent.length - 1];
    if (!last || last.type !== 'text') {
      content.push({ type: 'text' as const, text: '' });
    }

    const custom: GrueneratorMessageMetadata = {
      progress: { ...currentProgress, steps: [...progressSteps] },
    };
    if (receivedSearchResults.length > 0) custom.searchResults = receivedSearchResults;
    if (receivedSearchImages.length > 0) custom.searchImages = receivedSearchImages;
    if (receivedCitations.length > 0) custom.citations = receivedCitations;
    if (receivedImage) custom.generatedImage = receivedImage;
    if (receivedSharepicData) custom.sharepicData = receivedSharepicData;
    if (receivedSocialPostData) custom.socialPostData = receivedSocialPostData;
    if (receivedChartData) custom.chartData = receivedChartData;
    if (receivedArtifactData) custom.artifactData = receivedArtifactData;
    if (receivedComputeData) custom.computeData = receivedComputeData;
    if (receivedBahnData) custom.bahnData = receivedBahnData;
    if (receivedMetadata) custom.streamMetadata = receivedMetadata;
    else if (receivedTraceId)
      custom.streamMetadata = {
        intent: 'direct',
        searchCount: 0,
        totalTimeMs: 0,
        traceId: receivedTraceId,
      };
    if (receivedFollowUpSuggestions.length > 0)
      custom.followUpSuggestions = receivedFollowUpSuggestions;
    if (receivedConfirmAction) custom.confirmAction = receivedConfirmAction;
    if (receivedCreatedDocument) custom.createdDocument = receivedCreatedDocument;
    if (receivedReelProcessing) custom.reelProcessing = receivedReelProcessing;
    if (receivedReelPicker) custom.reelPicker = receivedReelPicker;
    if (evidenceWeakAccum) custom.evidenceWeak = evidenceWeakAccum;
    if (agentInfo?.agentId) {
      custom.agentId = agentInfo.agentId;
      if (agentInfo.agentMention) custom.agentMention = agentInfo.agentMention;
    }

    const isInterrupted = interruptPending && currentProgress.stage === 'complete';

    const result: ChatModelRunResult = {
      content,
      metadata: { custom },
      ...(isInterrupted
        ? { status: { type: 'requires-action' as const, reason: 'tool-calls' as const } }
        : {}),
    };
    // Record every result, not just the final one. assistant-ui merges a
    // yielded `content` by REPLACING the message content (initialContent is
    // frozen at roundtrip start), so a caller that has to report a mid-stream
    // failure must re-yield everything accumulated so far — and on a network
    // drop the end of this function is never reached.
    outcome.lastResult = result;
    return result;
  }

  // Feed chunks: stream from reader, or single chunk from full text fallback
  const chunks: AsyncIterable<Uint8Array> = reader
    ? {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            const { done, value } = await reader.read();
            return done
              ? { done: true as const, value: undefined }
              : { done: false as const, value };
          },
        }),
      }
    : (async function* () {
        yield new TextEncoder().encode(fullText!);
      })();

  for await (const value of chunks) {
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const { event, data: rawData, parseError } = parseSSELine(line, currentEvent);
      if (parseError) {
        // A few unparseable frames can be tolerated; a run of them means the
        // stream is corrupt and the user must not be shown a partial answer
        // as if it were complete.
        if (++consecutiveParseErrors >= MAX_CONSECUTIVE_PARSE_ERRORS) {
          throw new ChatStreamError('Die Antwort des Servers war beschädigt.', {
            code: 'stream_interrupted',
            retryable: true,
          });
        }
        continue;
      }
      // Reset only on a line that actually carried a parsed event. SSE framing
      // puts an `event:` line and a blank line between any two `data:` lines,
      // so resetting on every non-error line made the counter unreachable —
      // it never got past 1.
      if (event && rawData) consecutiveParseErrors = 0;
      if (!event || !rawData) continue;

      // Contract gate: every known event is validated against its wire
      // schema BEFORE the switch — the `as` casts below therefore assert on
      // schema-checked data instead of trusting the stream blindly. A
      // malformed event is dropped with a warning; unknown event names pass
      // through untouched (forward compatibility).
      const eventSchema = chatStreamEventSchemas[event];
      let data: unknown = rawData;
      if (eventSchema) {
        const gate = eventSchema.safeParse(rawData);
        if (!gate.success) {
          console.warn(
            `[GrueneratorModelAdapter] Dropping malformed "${event}" event:`,
            gate.error.issues[0],
            rawData
          );
          // An `error` event must NEVER be dropped: schema drift on the fatal
          // event would silently swallow the very failure it reports. Salvage
          // whatever string the payload has, else fall back to generic copy.
          if (event === 'error') {
            const raw = rawData as { error?: unknown };
            throw new ChatStreamError(
              typeof raw?.error === 'string' && raw.error.trim()
                ? raw.error
                : 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.',
              { code: 'internal' }
            );
          }
          continue;
        }
        data = gate.data;
      }

      switch (event) {
        case 'thread_created': {
          const { threadId: tid } = data as { threadId: string };
          callbacks.onThreadCreated?.(tid);
          // Backend has now persisted any seeded initialAssistantMessage as
          // the first row of this thread. Drop the local copy so a future
          // new-thread creation doesn't replay a stale seed.
          useAgentStore.getState().setPendingInitialAssistantMessage(null);
          break;
        }

        case 'intent': {
          const { intent, message, reasoning, searchQuery, subQueries, searchSources, agentic } =
            data as {
              intent: SearchIntent;
              message: string;
              reasoning?: string;
              searchQuery?: string;
              subQueries?: string[] | null;
              searchSources?: string[] | null;
              agentic?: boolean;
            };
          let stage: ProgressStage = 'searching';
          if (NO_RETRIEVAL_STAGE_INTENTS.has(intent) || intent === 'artifact') stage = 'generating';
          else if (ARTIFACT_STAGE_INTENTS.has(intent)) stage = 'generating_artifact';
          else if (intent === 'image' || intent === 'sharepic' || intent === 'social_post')
            stage = 'generating_image';
          else if (intent === 'summary') stage = 'summarizing';
          transitionStep(stage);
          currentProgress = { stage, message, intent, reasoning };

          // Agentic respond path: the model drives the tool loop, so real
          // tool_step_* cards will arrive. Skip the intent-fabricated tool card
          // (and its search_complete result stamping) — otherwise a ghost card
          // would sit alongside the real ones.
          const toolName = agentic ? undefined : INTENT_TO_TOOL[intent];
          if (toolName) {
            const hasMultiSearch =
              (subQueries && subQueries.length > 0) || (searchSources && searchSources.length > 1);

            if (hasMultiSearch) {
              const queries = subQueries?.length ? subQueries : [searchQuery ?? ''];
              const sources =
                searchSources?.length && searchSources.length > 1 ? searchSources : [null];

              for (let i = 0; i < queries.length; i++) {
                for (const src of sources) {
                  const effToolName =
                    src === 'web'
                      ? 'web_search'
                      : src === 'documents'
                        ? 'gruenerator_search'
                        : toolName;
                  const card: ToolCallPart = {
                    type: 'tool-call',
                    toolCallId: `tc_${Date.now()}_${i}_${src || 'default'}`,
                    toolName: effToolName,
                    args: { query: queries[i] },
                    argsText: JSON.stringify({ query: queries[i] }),
                  };
                  allToolCalls.push(card);
                  orderPushCard(card);
                }
              }
              activeToolCall = null;
            } else {
              // Don't fall back to `message` (the German status copy) — that
              // would display the status as the user's query. Empty string lets
              // the UI hide the chip text gracefully.
              const toolArgs = { query: searchQuery ?? '' };
              activeToolCall = {
                type: 'tool-call',
                toolCallId: `tc_${Date.now()}`,
                toolName,
                args: toolArgs,
                argsText: JSON.stringify(toolArgs),
              };
              orderPushCard(activeToolCall);
            }
          }
          yield buildResult();
          break;
        }

        case 'search_start': {
          const { message } = data as { message: string };
          transitionStep('searching');
          currentProgress = { ...currentProgress, stage: 'searching', message };
          yield buildResult();
          break;
        }

        case 'search_complete': {
          const { message, resultCount, results, images, researchMeta, examplesResult } = data as {
            message: string;
            resultCount: number;
            results?: SearchResult[];
            images?: SearchImage[];
            researchMeta?: unknown;
            examplesResult?: { press?: unknown[]; social?: unknown[]; message?: string };
          };
          if (results) receivedSearchResults = results;
          // Deliberately NOT merged into `receivedSearchResults`: those feed the
          // tool card's result data and the source list, and an image carries no
          // text to cite. They travel as their own metadata field instead.
          if (images?.length) receivedSearchImages = images;
          // Update searching step label with result count
          const searchStep = progressSteps.find((s) => s.stage === 'searching');
          if (searchStep) {
            searchStep.label = `${resultCount} Ergebnisse`;
            searchStep.status = 'completed';
            searchStep.completedAt = Date.now();
          }
          transitionStep('generating');
          currentProgress = {
            ...currentProgress,
            stage: 'generating',
            message,
            resultCount,
          };

          // Pick the right result shape per tool:
          // - research → researchMeta (rich orchestrator result)
          // - gruenerator_pressemitteilung_examples → { examples: press[], results }
          // - gruenerator_examples_search → { examples: social[], results }
          // - everything else → { results }
          const resultForTool = (toolName: string) => {
            /**
             * @deprecated `researchMeta` is the legacy dossier shape — no path emits
             * it since 2026-07-30, dossiers ship as message text now. Pre-2026-07-30
             * turns still carry their dossier ONLY in this field (the assistant
             * message itself was just two framing sentences); keep until a backfill
             * moves `researchMeta.answer` into message content.
             */
            if (toolName === 'research' && researchMeta != null) {
              return researchMeta as Record<string, unknown>;
            }
            if (toolName === 'gruenerator_pressemitteilung_examples' && examplesResult?.press) {
              return { results: results || [], examples: examplesResult.press };
            }
            if (toolName === 'gruenerator_examples_search' && examplesResult?.social) {
              return { results: results || [], examples: examplesResult.social };
            }
            return { results: results || [] };
          };

          for (let i = 0; i < allToolCalls.length; i++) {
            if (!allToolCalls[i].result) {
              allToolCalls[i] = {
                ...allToolCalls[i],
                result: resultForTool(allToolCalls[i].toolName),
              };
              orderReplaceCard(allToolCalls[i]);
            }
          }
          if (activeToolCall) {
            activeToolCall = Object.assign({}, activeToolCall, {
              result: resultForTool(activeToolCall.toolName),
            });
            orderReplaceCard(activeToolCall);
          }
          yield buildResult();
          break;
        }

        // The loop's channel for image hits. Deliberately touches NOTHING but the
        // image list: unlike `search_complete` it must not move the progress
        // stage, because it arrives mid-loop while the model is still working.
        // The payload is the full list for the turn, so replacing is correct —
        // a second search's event supersedes the first.
        case 'search_images': {
          const { images } = data as { images: SearchImage[] };
          if (images.length > 0) {
            receivedSearchImages = images;
            yield buildResult();
          }
          break;
        }

        case 'summary_start': {
          const { message } = data as { message: string };
          transitionStep('summarizing');
          currentProgress = { ...currentProgress, stage: 'summarizing', message };
          yield buildResult();
          break;
        }

        case 'summary_complete': {
          const { message } = data as { message: string };
          transitionStep('generating');
          currentProgress = { ...currentProgress, stage: 'generating', message };
          yield buildResult();
          break;
        }

        case 'image_start': {
          const { message } = data as { message: string };
          transitionStep('generating_image');
          currentProgress = { ...currentProgress, stage: 'generating_image', message };
          yield buildResult();
          break;
        }

        case 'image_complete': {
          const {
            message,
            image,
            error: imageError,
          } = data as {
            message: string;
            image?: GeneratedImage;
            error?: string;
          };
          if (image) receivedImage = image;
          transitionStep(imageError ? 'error' : 'generating');
          currentProgress = {
            ...currentProgress,
            stage: imageError ? 'error' : 'generating',
            message,
          };
          yield buildResult();
          break;
        }

        case 'chart_data': {
          const { chart } = data as { chart?: ChartData };
          if (chart) receivedChartData = chart;
          yield buildResult();
          break;
        }

        case 'artifact': {
          const { artifact } = data as {
            artifact?: { type: 'html' | 'svg'; title: string; content: string };
          };
          if (artifact) {
            const active: CodeArtifact = { id: `artifact-${Date.now()}`, ...artifact };
            receivedArtifactData = active;
            // Open the docked panel immediately — nur dort, wo sie andocken
            // kann. Auf schmalen Geräten bleibt es bei der Karte im Faden.
            if (canAutoOpenArtifactPanel()) {
              useArtifactLiveStore.getState().setActiveArtifact(active);
            }
          }
          yield buildResult();
          break;
        }

        // A deep research run has started: open the panel so the user can watch
        // it work. The run takes minutes, so this is the only feedback there is
        // until the document appears at the end.
        case 'research_log_start': {
          const { id, title } = data as { id?: string; title?: string };
          if (id) {
            useArtifactLiveStore.getState().setActiveArtifact({
              id,
              type: 'research_log',
              title: title ?? 'Recherche',
              plan: [],
              steps: [],
              status: 'running',
            });
          }
          yield buildResult();
          break;
        }

        case 'research_log_update': {
          const patch = data as {
            id?: string;
            plan?: ResearchLogStep[];
            steps?: ResearchLogStep[];
            status?: 'running' | 'done' | 'failed';
            documentUrl?: string;
            documentId?: string;
          };
          if (patch.id) {
            const { id, ...rest } = patch;
            useArtifactLiveStore.getState().upsertResearchLog(id, rest);
          }
          yield buildResult();
          break;
        }

        case 'compute': {
          const { compute } = data as { compute?: ComputeData };
          if (compute) receivedComputeData = compute;
          yield buildResult();
          break;
        }

        case 'bahn': {
          const { bahn } = data as { bahn?: BahnPayload };
          if (bahn) receivedBahnData = bahn;
          yield buildResult();
          break;
        }

        case 'sharepic_complete': {
          const payload = data as {
            message: string;
            variants?: unknown;
            canvasType?: string;
            initialProps?: Record<string, unknown>;
            alternatives?: unknown[];
            error?: string;
          };
          if (!payload.error) {
            // Validate at the boundary: only variants with a canonical
            // canvasType are kept, so a malformed type can never reach the
            // studio handoff / canvas mint.
            const validated = coerceSharepicVariants(payload.variants);
            if (validated) {
              receivedSharepicData = { variants: validated };
            } else if (isCanvasTemplateType(payload.canvasType) && payload.initialProps) {
              const legacyId =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `legacy-${Date.now()}`;
              receivedSharepicData = {
                variants: [
                  {
                    id: legacyId,
                    canvasType: payload.canvasType,
                    initialProps: payload.initialProps,
                  },
                ],
              };
            }
          }
          transitionStep(payload.error ? 'error' : 'generating');
          currentProgress = {
            ...currentProgress,
            stage: payload.error ? 'error' : 'generating',
            message: payload.message,
          };
          yield buildResult();
          break;
        }

        case 'social_post_complete': {
          const payload = data as {
            message: string;
            post?: SocialPostPayload;
            error?: string;
          };
          if (!payload.error && payload.post) {
            receivedSocialPostData = payload.post;
            useSocialPostLiveStore.getState().upsertEntry(payload.post);
          }
          // Text half only — the sharepic half drives the stage transitions
          // via its own sharepic_complete; don't flip to error here when just
          // the text failed (the card shows the degradation).
          yield buildResult();
          break;
        }

        case 'social_post_updated': {
          const payload = data as {
            postId: string;
            post: SocialPostPayload;
            summary: string;
          };
          useSocialPostLiveStore.getState().upsertEntry(payload.post);
          break;
        }

        case 'social_post_edit_error': {
          const { error } = data as { postId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] social_post_edit_error:', error);
          notifyError('Post konnte nicht bearbeitet werden', error);
          break;
        }

        case 'sharepic_minted': {
          const { variantId, canvasId } = data as { variantId: string; canvasId: string };
          useSharepicLiveStore.getState().upsertEntry(variantId, { canvasId });
          break;
        }

        case 'sharepic_updated': {
          // Validated by the contract gate above — canvasType is guaranteed
          // canonical, so junk template types can never enter the live store.
          const payload = data as SharepicUpdatedEvent;
          useSharepicLiveStore.getState().upsertEntry(payload.variantId, {
            canvasId: payload.canvasId,
            canvasType: payload.canvasType,
            version: payload.version,
            state: payload.state ?? null,
            ...(payload.pages ? { pages: payload.pages } : {}),
            summary: payload.summary,
            thumbnailDirty: true,
          });
          break;
        }

        case 'sharepic_edit_error': {
          const { error } = data as { variantId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] sharepic_edit_error:', error);
          notifyError('Sharepic konnte nicht bearbeitet werden', error);
          break;
        }

        case 'reel_processing': {
          receivedReelProcessing = data as { uploadId: string; filename: string };
          yield buildResult();
          break;
        }

        case 'reel_picker': {
          receivedReelPicker = data as ReelPickerData;
          yield buildResult();
          break;
        }

        case 'reel_updated': {
          const payload = data as {
            projectId: string;
            title: string;
            segments: Array<{ id: number; startTime: number; endTime: number; text: string }>;
            summary: string;
            changedIndices: number[];
          };
          const reelStore = useReelLiveStore.getState();
          reelStore.upsertEntry(payload.projectId, {
            title: payload.title,
            segments: payload.segments,
            summary: payload.summary,
            changedIndices: payload.changedIndices,
          });
          // Auto-open the docked panel on the edited reel.
          if (reelStore.activeReel?.projectId !== payload.projectId) {
            reelStore.setActiveReel({ projectId: payload.projectId, title: payload.title });
          }
          break;
        }

        case 'reel_edit_error': {
          const { error } = data as { projectId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] reel_edit_error:', error);
          notifyError('Untertitel konnten nicht bearbeitet werden', error);
          break;
        }

        // Agentic tool loop (sharepic edit + general respond loop): each tool
        // step renders as a tool-call part, mirroring the thinking_step
        // archive-and-replace mechanics (including the duplicate-stepId guard).
        case 'tool_step_start': {
          breakReasoningBlock();
          const {
            stepId,
            toolName,
            args,
            title: serverTitle,
            serverName,
            narration: serverNarration,
          } = data as {
            stepId: string;
            toolName: string;
            args?: Record<string, unknown>;
            title?: string;
            serverName?: string;
            narration?: string;
          };
          // Associate narration with this card: prefer the server-stamped value
          // (also survives reload); else drain the client buffer (old server).
          const cardNarration =
            serverNarration ??
            (pendingNarration.length > 0 ? pendingNarration.join(' ') : undefined);
          pendingNarration = [];
          // Prefer a server-provided title; else the legacy mcpToolNode
          // `mcp_tool` server/tool label; else the sharepic-specific map; else a
          // generic label derived from the (possibly MCP-namespaced) name.
          const title =
            serverTitle ??
            (toolName === 'mcp_tool'
              ? `${(args?.server as string) ?? 'MCP'}${args?.tool ? ` · ${args.tool as string}` : ''}`
              : (TOOL_STEP_TITLES[toolName] ??
                `${formatNamespacedToolLabel(toolName, serverName)}…`));
          const alreadyKnown =
            toolStepsById.has(stepId) || allToolCalls.some((tc) => tc.toolCallId === stepId);
          if (!alreadyKnown) {
            const toolArgs = { query: title, ...(args ?? {}) };
            const toolCall: ToolCallPart = {
              type: 'tool-call',
              toolCallId: stepId,
              toolName,
              args: toolArgs as Record<string, string | number | boolean | null>,
              argsText: JSON.stringify(toolArgs),
              ...(cardNarration ? { narration: cardNarration } : {}),
            };
            // Push immediately so a parallel sibling's start doesn't orphan this
            // card; the result updates it in place. orderPushCard breaks the
            // current text run so a preceding text_delta stays a separate segment.
            toolStepsById.set(stepId, toolCall);
            allToolCalls.push(toolCall);
            orderPushCard(toolCall);
          }
          // Narration now lives on the card; clear the transient status line.
          // A generation tool gets its own stage — see ARTIFACT_TOOL_NAMES. The
          // step is also transitioned so the tracker stops showing the previous
          // stage as still running while a 90s generation goes on beneath it.
          const toolStage: ProgressStage = ARTIFACT_TOOL_NAMES.has(toolName)
            ? 'generating_artifact'
            : 'searching';
          if (toolStage !== currentProgress.stage) transitionStep(toolStage);
          currentProgress = { stage: toolStage, message: title, pendingNarration: [] };
          yield buildResult();
          break;
        }

        case 'tool_step_result': {
          const { stepId, ok, summary, result } = data as {
            stepId: string;
            toolName: string;
            ok: boolean;
            summary?: string;
            result?: Record<string, unknown>;
          };
          const pending = toolStepsById.get(stepId);
          if (pending) {
            // Stamp the rich per-tool result (results/examples/researchMeta) so
            // the tool-ui card renders mid-stream from the real tool output,
            // not just an ok/summary status. ok/summary are folded in for the
            // generic status chip. Replace by identity so memoized consumers
            // re-render.
            // A system MCP tool may ship an MCP-Apps widget: lift its `ui://`
            // pointer onto `mcp.app` so assistant-ui's mcpApp renderer mounts
            // the sandboxed widget iframe in place of the normal tool card.
            const uiResource = (result as { uiResource?: { uri?: unknown; mimeType?: unknown } })
              ?.uiResource;
            const widgetUri =
              uiResource && typeof uiResource.uri === 'string' && uiResource.uri.startsWith('ui://')
                ? uiResource.uri
                : null;
            const updated: ToolCallPart = {
              ...pending,
              result: { ...(result ?? {}), ok, ...(summary ? { summary } : {}) },
              ...(widgetUri
                ? {
                    mcp: {
                      app: {
                        resourceUri: widgetUri,
                        ...(typeof uiResource?.mimeType === 'string'
                          ? { mimeType: uiResource.mimeType }
                          : {}),
                      },
                    },
                  }
                : {}),
            };
            toolStepsById.set(stepId, updated);
            const idx = allToolCalls.indexOf(pending);
            if (idx >= 0) allToolCalls[idx] = updated;
            // The step object is REPLACED (not mutated) here, so mirror the swap
            // into orderedContent by toolCallId — otherwise the card would keep
            // its pre-result state on screen.
            orderReplaceCard(updated);
          }
          // The STEP has to move with the stage, not just the message: the step
          // list is what the tracker labels itself from, so a finished tool that
          // only flipped `currentProgress` left "Suche läuft" standing over the
          // rest of the turn.
          //
          // …but only once NOTHING is still running. A model step may call two
          // tools at once (loopGuards allows two concurrent searches), and the
          // first result back would otherwise complete the step while its
          // sibling is still working — the tracker would claim the retrieval was
          // done and go on to "Formuliere Antwort".
          const stepStillOpen = [...toolStepsById.values()].some((s) => s.result == null);
          const message = summary ?? (ok ? 'Änderung angewendet' : 'Schritt fehlgeschlagen');
          if (stepStillOpen) {
            currentProgress = { ...currentProgress, message };
          } else {
            transitionStep('generating');
            currentProgress = { stage: 'generating', message };
          }
          yield buildResult();
          break;
        }

        case 'response_start': {
          // Split mode's synth phase starts here — its thinking is a new block,
          // not a continuation of the planner's.
          breakReasoningBlock();
          const { message } = data as { message: string };
          transitionStep('generating');
          currentProgress = { ...currentProgress, stage: 'generating', message };
          yield buildResult();
          break;
        }

        case 'thinking_step': {
          const { stepId, toolName, title, status, args, result } = data as {
            stepId: string;
            toolName: string;
            title: string;
            status: 'in_progress' | 'completed';
            args?: Record<string, unknown>;
            result?: {
              resultCount?: number;
              results?: unknown[];
              image?: unknown;
              error?: string;
            };
          };

          const mappedToolName = DEEP_TOOL_MAP[toolName] || toolName;

          if (status === 'in_progress') {
            // A re-sent stepId must not become a SECOND card: if it matches the
            // current activeToolCall, or is already in allToolCalls, skip the
            // archive-and-replace below — otherwise we'd render two tool-call
            // parts with the same toolCallId and trip assistant-ui's
            // `tapResources` with "Duplicate key toolCallId-…".
            //
            // Note this only dedupes; it does not make a repeat HARMLESS. Every
            // `thinking_step` opens a card that stays on screen until a matching
            // `completed` closes it, so this event is for real tools only —
            // internal stages narrate through `progress_step` (see below).
            const isDuplicateStepId =
              (activeToolCall !== null && activeToolCall.toolCallId === stepId) ||
              allToolCalls.some((tc) => tc.toolCallId === stepId);
            if (!isDuplicateStepId) {
              // Preserve any pre-existing activeToolCall (e.g. the intent-derived
              // gruenerator_examples_search tool-call set by the `intent` event)
              // before overwriting with this thinking_step's tool. Otherwise the
              // examples tool-call is orphaned and search_complete's result has
              // nowhere to land — leaving the UI with classify/rerank chips and
              // no examples card.
              if (activeToolCall !== null && !allToolCalls.includes(activeToolCall)) {
                allToolCalls.push(activeToolCall);
              }
              const toolArgs = { query: (args?.query as string) || title, ...args };
              activeToolCall = {
                type: 'tool-call',
                toolCallId: stepId,
                toolName: mappedToolName,
                args: toolArgs as Record<string, string | number | boolean | null>,
                argsText: JSON.stringify(toolArgs),
              };
              orderPushCard(activeToolCall);
            }
            currentProgress = { stage: 'searching', message: title };
          } else if (status === 'completed') {
            if (activeToolCall?.toolCallId === stepId) {
              activeToolCall = { ...activeToolCall, result: result || {} };
              orderReplaceCard(activeToolCall);
              allToolCalls.push(activeToolCall);
              activeToolCall = null;
            }
            currentProgress = { stage: 'generating', message: title };
          }
          yield buildResult();
          break;
        }

        case 'progress_step': {
          // Internal pipeline stage (classify, rerank, brief). Updates the
          // progress indicator but MUST NOT touch activeToolCall/allToolCalls
          // — those are reserved for user-facing tools dispatched via the
          // `intent` event + `thinking_step`. Conflating the two is what
          // caused the search→rerank race that orphaned the rich
          // examples/search/web tool-cards (see PR history).
          const { stepId, title, status } = data as {
            stepId: string;
            toolName: string;
            title: string;
            status: 'in_progress' | 'completed';
          };
          if (status === 'in_progress') {
            // Until 14.08.2026 `title` only ever reached `currentProgress.message`,
            // which the ProgressTracker does not read — `selectStatusLabel` takes
            // the step label ahead of `message`, and there is always a step list.
            // So a pipeline agent's after-steps ran for minutes under step 1's
            // label ("Feile …"), indistinguishable from a hang. The step now
            // enters the list, under the same stage as before but under its OWN
            // key, so it never overwrites a real search step's label. Guarded so
            // the 3s heartbeat re-send does not churn the list.
            if (currentProgress.stage !== 'searching' || currentProgress.message !== title) {
              transitionStep('searching', title, `progress:${stepId}`);
            }
            currentProgress = { ...currentProgress, stage: 'searching', message: title };
          } else if (status === 'completed') {
            currentProgress = { ...currentProgress, message: title };
          }
          yield buildResult();
          break;
        }

        case 'gather_narration': {
          // Live narration during the tool phase. Accumulated (not overwritten)
          // into pendingNarration so nothing is lost between tool starts; the
          // consumer paces the display (min-visible time), and the whole run
          // lands on the next tool card as durable `narration`. `message` is
          // still set so Mobile's simple status field and non-agentic paths
          // keep a value.
          const narration = (data as { text: string }).text;
          pendingNarration = [...pendingNarration, narration];
          currentProgress = { ...currentProgress, message: narration, pendingNarration };
          const now = performance.now();
          if (now - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = now;
            yield buildResult();
          }
          break;
        }

        case 'text_delta': {
          const delta = (data as { text: string }).text;
          appendText(delta);
          // Synthesis has started: any trailing narration after the last tool
          // call (never associated with a card) is now stale — drop it so the
          // status line doesn't linger behind the streaming answer.
          if (pendingNarration.length > 0) {
            pendingNarration = [];
            currentProgress = { ...currentProgress, pendingNarration: [] };
          }
          const now = performance.now();
          if (now - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = now;
            yield buildResult();
          }
          break;
        }

        case 'reasoning_delta': {
          accumulatedReasoning += (data as { text: string }).text;
          const now = performance.now();
          if (now - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = now;
            yield buildResult();
          }
          break;
        }

        case 'fallback': {
          // Server switched models silently — log only, no UI.
          const info = data as FallbackInfo;
          console.warn(
            `[GrueneratorModelAdapter] Model fallback: ${info.from.id} → ${info.to.id} (${info.reason})`
          );
          break;
        }

        case 'warning': {
          // Non-fatal degradation carrying a ready-made German message.
          // Note: `evidence_weak` is a statement about THIS answer, not a
          // disruption — it goes under the text (custom.evidenceWeak), not in
          // a toast that sits above the page and belongs to no message.
          const { code, message } = data as { code: string; message: string };
          console.warn(`[GrueneratorModelAdapter] warning (${code}): ${message}`);
          if (code === 'evidence_weak') {
            if (message) evidenceWeakAccum = message;
            break;
          }
          if (message) notifyWarning(message);
          break;
        }

        case 'interrupt': {
          const payload = data as {
            interruptType?: 'clarification' | 'client_tool' | 'tool_approval';
            toolName?: string;
            args?: Record<string, unknown>;
            threadId?: string;
            approvalTurnId?: string;
            calls?: Array<{
              toolCallId: string;
              toolName: string;
              args?: Record<string, unknown>;
              title?: string;
              serverName?: string;
            }>;
          };
          if (payload.interruptType === 'client_tool' && payload.toolName) {
            clientToolPending = true;
            outcome.clientToolInterrupt = {
              toolName: payload.toolName,
              args: payload.args ?? {},
              ...(payload.threadId != null && { threadId: payload.threadId }),
            };
          } else if (payload.interruptType === 'tool_approval' && payload.calls?.length) {
            // Jeder zurückgehaltene Aufruf wird eine Karte mit Freigabe-Gate.
            // Das Gate selbst hält den Zug an (assistant-ui: eine unentschiedene
            // Freigabe blockiert die Fortsetzung), `interruptPending` sorgt für
            // den `requires-action`-Status, den die Laufzeit dafür verlangt.
            for (const call of payload.calls) {
              const args = { ...(call.args ?? {}) };
              const part: ToolCallPart = {
                type: 'tool-call',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                args: args as Record<string, string | number | boolean | null>,
                argsText: JSON.stringify(args),
                approval: {
                  id: call.toolCallId,
                  options: TOOL_APPROVAL_OPTIONS,
                },
                // Ohne die beiden nennt die Karte nur den Katalognamen — und
                // genau die Auskunft, welcher Dienst da angesprochen wird, ist
                // der Grund für die Rückfrage.
                ...(call.title != null && { title: call.title }),
                ...(call.serverName != null && { serverName: call.serverName }),
              };
              toolStepsById.set(call.toolCallId, part);
              allToolCalls.push(part);
              orderPushCard(part);
            }
            if (payload.approvalTurnId != null) {
              outcome.toolApprovalPending = { approvalTurnId: payload.approvalTurnId };
            }
            interruptPending = true;
          } else {
            interruptPending = true;
          }
          yield buildResult();
          break;
        }

        case 'done': {
          sawTerminalEvent = true;
          const {
            citations: cit,
            generatedImage: img,
            metadata,
            interrupted,
          } = data as {
            threadId?: string;
            citations?: Citation[];
            generatedImage?: GeneratedImage;
            metadata?: StreamMetadata;
            interrupted?: boolean;
          };
          if (cit) receivedCitations = cit;
          if (img) receivedImage = img;
          if (metadata) receivedMetadata = metadata;
          if (interrupted && !clientToolPending) interruptPending = true;
          transitionStep('complete');
          currentProgress = { stage: 'complete', message: '' };
          break;
        }

        case 'confirm_action': {
          receivedConfirmAction = data as ConfirmActionData;
          yield buildResult();
          break;
        }

        case 'document_created': {
          const created = data as DocumentCreatedData;
          receivedCreatedDocument = created;
          // Mirror the 'artifact' case: dock the panel immediately instead of
          // waiting for a click on DocumentCreatedCard's button. PDFs are
          // excluded — their url is an authenticated asset endpoint (needs
          // configFetch + blob), not something a plain iframe src can load.
          // Only where an ArtifactPanel is actually mounted (/chat thread view):
          // elsewhere the write is invisible AND would close a docked
          // sharepic/reel via the one-panel rule with nothing replacing it.
          if (
            useArtifactLiveStore.getState().panelMounted &&
            canAutoOpenArtifactPanel() &&
            subtypeToArtifactKind(created.subtype) !== 'pdf'
          ) {
            useArtifactLiveStore.getState().setActiveArtifact({
              id: `document-${created.documentId}`,
              type: 'document',
              documentId: created.documentId,
              subtype: created.subtype,
              title: created.title,
              url: created.url,
            });
          }
          yield buildResult();
          break;
        }

        case 'document_indexed': {
          const { documentId } = data as { documentId: string };
          outcome.indexedDocumentIds.push(documentId);
          break;
        }

        case 'trigger_doc_edit': {
          // Live document edit (docs editor surface). The chat backend has
          // classified intent=edit_current_doc and forwards the user's prompt
          // here so the docs frontend can dispatch into BlockNote's AIExtension.
          // Handlers are keyed by documentId — there's exactly one docs surface
          // per document, registered when DocsAssistantChat mounts.
          const parsed = triggerDocEditSchema.safeParse(data);
          if (!parsed.success) {
            console.warn('[ChatAdapter] trigger_doc_edit payload failed validation', parsed.error);
            notifyError('Dokument konnte nicht bearbeitet werden', 'Die Anweisung war ungültig.');
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore
            .getState()
            .documentEditHandlers.get(payload.targetDocumentId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] documentEditHandler threw', err);
              notifyError(
                'Dokument konnte nicht bearbeitet werden',
                'Die Änderung konnte nicht angewendet werden.'
              );
            }
          } else {
            console.warn(
              '[ChatAdapter] trigger_doc_edit received but no handler registered for doc',
              payload.targetDocumentId
            );
            notifyWarning(
              'Dokument nicht verbunden',
              'Öffne die Datei, damit Änderungen angewendet werden können.'
            );
          }
          break;
        }

        case 'trigger_board_action': {
          // Live board edit (boards editor surface). The chat backend has
          // classified intent=edit_current_board and forwards the user's prompt
          // here so the boards frontend can plan + apply operations on the live
          // Yjs board. Handlers are keyed by boardId — one boards surface per
          // board, registered when BoardAssistantProvider mounts.
          const parsed = triggerBoardActionSchema.safeParse(data);
          if (!parsed.success) {
            console.warn(
              '[ChatAdapter] trigger_board_action payload failed validation',
              parsed.error
            );
            notifyError('Board konnte nicht bearbeitet werden', 'Die Anweisung war ungültig.');
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore
            .getState()
            .boardActionHandlers.get(payload.targetBoardId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] boardActionHandler threw', err);
              notifyError(
                'Board konnte nicht bearbeitet werden',
                'Die Änderung konnte nicht angewendet werden.'
              );
            }
          } else {
            console.warn(
              '[ChatAdapter] trigger_board_action received but no handler registered for board',
              payload.targetBoardId
            );
            notifyWarning(
              'Board nicht verbunden',
              'Öffne die Datei, damit Änderungen angewendet werden können.'
            );
          }
          break;
        }

        case 'editor_operations': {
          // Tool-based editor edit (CHAT_EDIT_TOOL_SURFACES): the agentic loop's
          // edit_document tool planned ops server-side; apply them in place via
          // the surface's registered handler (Univer / Yjs / Konva bridge).
          // Keyed by targetId, parallel to the trigger_doc_edit path (which stays
          // the fallback when the backend flag is off).
          const parsed = editorOperationsEventSchema.safeParse(data);
          if (!parsed.success) {
            console.warn('[ChatAdapter] editor_operations payload failed validation', parsed.error);
            notifyError(
              'Editor-Inhalt konnte nicht bearbeitet werden',
              'Die Anweisung war ungültig.'
            );
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore.getState().editorOpsHandlers.get(payload.targetId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] editorOpsHandler threw', err);
              notifyError(
                'Editor-Inhalt konnte nicht bearbeitet werden',
                'Die Änderung konnte nicht angewendet werden.'
              );
            }
          } else {
            console.warn(
              '[ChatAdapter] editor_operations received but no handler registered for target',
              payload.targetId
            );
            notifyWarning(
              'Editor-Inhalt nicht verbunden',
              'Öffne die Datei, damit Änderungen angewendet werden können.'
            );
          }
          break;
        }

        // ── Search mode events ──
        case 'sources_preview': {
          const { results: previewResults, resultCount } = data as {
            results?: SearchResult[];
            resultCount?: number;
          };
          if (previewResults) {
            receivedSearchResults = previewResults;
            // Create synthetic search_sources tool call for sources-first rendering
            const sourcesToolCall: ToolCallPart = {
              type: 'tool-call',
              toolCallId: `tc_sources_${Date.now()}`,
              toolName: 'search_sources',
              argsText: '{}',
              args: {},
              result: {
                results: previewResults,
                resultCount: resultCount || previewResults.length,
              },
            };
            allToolCalls.push(sourcesToolCall);
            orderPushCard(sourcesToolCall);
          }
          transitionStep('generating', 'Generierung');
          break;
        }

        case 'suggestions': {
          const { suggestions: sugg } = data as { suggestions?: string[] };
          if (sugg) {
            receivedFollowUpSuggestions = sugg;
          }
          break;
        }

        case 'research_step': {
          const { step, message } = data as { step: string; message: string };
          transitionStep(step as ProgressStage, message);
          currentProgress = { stage: step as ProgressStage, message };
          break;
        }

        // ── Notebook mode events ──
        case 'completion': {
          sawTerminalEvent = true;
          // `completion` carries EITHER shape (see the union in the wire
          // schema): notebook citations key their source as `index: string`
          // with snake_case document fields, while the citation clamp on the
          // chat paths re-sends the chat shape it already had. Mapping every
          // payload as notebook — the previous behaviour — turned a clamped
          // chat turn's citations into `id: NaN` with empty titles until the
          // trailing `done` event happened to overwrite them again.
          type NotebookWireCitation = {
            index: string;
            cited_text?: string;
            document_title?: string;
            document_id?: string;
            source_url?: string | null;
            similarity_score?: number;
            chunk_index?: number;
            collection_id?: string;
            collection_name?: string;
          };
          const completionData = data as {
            text?: string;
            citations?: Array<NotebookWireCitation | Citation>;
            metadata?: { traceId?: string };
          };
          if (typeof completionData.metadata?.traceId === 'string') {
            receivedTraceId = completionData.metadata.traceId;
          }
          const isNotebookCitation = (
            c: NotebookWireCitation | Citation
          ): c is NotebookWireCitation => typeof (c as NotebookWireCitation).index === 'string';
          if (completionData.text) {
            // Flatten fallback: `completion` replaces the whole answer (e.g.
            // after a citation clamp), so we have ONE final text with no per-tool
            // offsets. Drop every streamed text segment and append a single
            // trailing one; cards keep their positions in orderedContent.
            // buildResult re-normalizes [cite:N] → [N] on emit.
            for (let i = orderedContent.length - 1; i >= 0; i--) {
              if (orderedContent[i].type === 'text') orderedContent.splice(i, 1);
            }
            const finalSeg: TextSegment = { type: 'text', text: completionData.text };
            orderedContent.push(finalSeg);
            currentTextSegment = finalSeg;
          }
          if (completionData.citations) {
            receivedCitations = completionData.citations.map((c) =>
              isNotebookCitation(c)
                ? {
                    id: parseInt(c.index, 10),
                    title: c.document_title ?? '',
                    url: c.source_url ?? '',
                    snippet: c.cited_text ?? '',
                    citedText: c.cited_text,
                    source: c.collection_name ?? '',
                    collectionName: c.collection_name,
                    documentId: c.document_id,
                    chunkIndex: c.chunk_index,
                    similarityScore: c.similarity_score,
                    collectionId: c.collection_id,
                  }
                : c
            );
          }
          transitionStep('complete');
          currentProgress = { stage: 'complete', message: '' };
          break;
        }

        case 'error': {
          const payload = data as ChatErrorEventPayload;
          transitionStep('error');
          throw new ChatStreamError(payload.error ?? 'Es ist ein Fehler aufgetreten.', payload);
        }
        default:
          // Unknown event names pass through untouched (forward compatibility).
          break;
      }
    }
  }

  // Client half of the truncation cross-check. The server runs the identical
  // test on the text it generated (`looksCutOff`, apps/api/.../outputSanity.ts)
  // and logs its own char count as `chars=N`. Comparing the two numbers is what
  // localises a "the answer just stops" report without a repro:
  //   same count   → the model stopped early (check finishReason in the backend)
  //   fewer here   → the tail was lost between server and screen
  // Only warns on the suspicious shape, so a normal turn stays quiet.
  const assembled = orderedContent
    .filter((el): el is TextSegment => el.type === 'text')
    .map((el) => el.text)
    .join('');
  // Mirrors TRUNCATION_MIN_WORDS on the server: under five words, "ends on a
  // letter" is the shape of a demanded one-liner ("KEINE DATEN") as often as of
  // a severed sentence, and warning on both is how the real cut got read as
  // noise.
  const tail = assembled.trimEnd();
  if (tail.split(/\s+/).filter(Boolean).length >= 5 && /[\p{L}\p{N}]$/u.test(tail)) {
    console.warn(
      `[GrueneratorModelAdapter] answer ends mid-sentence after ${assembled.length} chars ` +
        `(compare the backend's "chars=" line) — tail: ${JSON.stringify(assembled.slice(-60))}`
    );
  }

  const finalResult = buildResult();
  outcome.lastResult = finalResult;
  yield finalResult;

  outcome.interrupted = interruptPending;
  // Report whether the backend actually finished. Without this a stream that
  // simply closed (proxy timeout, worker recycle) was indistinguishable from a
  // completed turn — the adapter now marks those failed instead.
  outcome.completed = sawTerminalEvent || interruptPending || clientToolPending;

  if (receivedMetadata && !interruptPending && !clientToolPending) {
    callbacks.onComplete?.(receivedMetadata);
  }
}
