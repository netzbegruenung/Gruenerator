/**
 * Response Streaming Service
 *
 * Handles AI model resolution and text streaming:
 * - Model selection (user override vs agent default)
 * - Building the final messages array for AI
 * - Streaming text via SSE with first-token deadline + cross-provider fallback
 */

import { streamText, type ModelMessage, type LanguageModel } from 'ai';

import { isReasoningCapable } from '../../../services/ai/modelDiscovery.js';
import {
  isReasoningStreamModel,
  ReasoningStreamUnavailableError,
  streamWithReasoning,
  type ThinkingEffort,
} from '../../../services/ai/regoloReasoningStream.js';
import { createLogger } from '../../../utils/logger.js';
import {
  resolveAutoSelection,
  VERDIGADO_INPUT_LIMIT,
  type Complexity,
  type ReasoningSetting,
  type TaskShape,
} from '../agents/autoPolicy.js';
import {
  getModel,
  resolveModelTuple,
  VISION_MODEL,
  isVisionCapable,
  type ResolvedModelTuple,
} from '../agents/providers.js';

import { sanitizeContentPartsForModel, stripEmptyAssistantMessages } from './messageHelpers.js';
import {
  PROGRESS_MESSAGES,
  startResponseHeartbeat,
  type FallbackReason,
  type SSEWriter,
} from './sseHelpers.js';
import { createIdleDeadline, type IdleDeadline } from './streamIdleDeadline.js';

const log = createLogger('ResponseStreaming');

/**
 * How long the upstream model may stay SILENT before it is declared dead and
 * the fallback fires. Generous enough for gemma's reasoning preamble on LiteLLM
 * (~10s observed), with headroom for production load. Idle-based: any output
 * rearms it — see createFirstTokenDeadline.
 */
const FIRST_TOKEN_DEADLINE_MS = 20_000;

// Turn-level wall-clock for the single-pass streaming path. The first-token
// deadline is CLEARED once text starts, leaving Phase 2 (the drain loop)
// uncapped — a slow/trickling generation ran 338 s live. This ceiling composes
// into the streamText abortSignal and is NEVER cleared, so it bounds the whole
// turn (both phases + any fallback attempt). The agentic loop has its own
// wall-clock budget and does not use these functions.
const SINGLE_PASS_WALL_CLOCK_MS = (() => {
  const n = Number.parseInt(process.env.CHAT_SINGLE_PASS_WALL_CLOCK_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 180_000;
})();
/** LiteLLM overflow lane can queue behind its single Verdigado slot. */
const LITELLM_FIRST_TOKEN_DEADLINE_MS = 30_000;
/**
 * Reasoning models (Regolo vLLM, Verdigado/LiteLLM Gemma) hold back answer text
 * until thinking completes, so the wait for the first TEXT token is legitimately
 * longer than on a plain lane.
 *
 * This is an IDLE window, not a total budget: reasoning deltas rearm it (see
 * createFirstTokenDeadline), so a genuine 60s thinking phase runs to completion
 * as long as the model keeps emitting. It only trips on true silence — which is
 * what "hung" actually means. Before that fix the same 20s was a hard ceiling
 * on thinking, and a research turn died on verdigado-think at exactly 20s, then
 * on its regolo/gemma4-31b sibling at exactly 20s again.
 */
const REASONING_FIRST_TOKEN_DEADLINE_MS = 20_000;

/**
 * `thinking` defaults to true so an unqualified call keeps the pre-policy
 * behaviour. When the auto policy turned reasoning OFF for a lane that would
 * normally think, there is no thinking phase to wait through — it should be
 * held to the ordinary deadline, not the generous reasoning one.
 */
export function getFirstTokenDeadlineMs(
  provider: string,
  modelName: string,
  thinking = true
): number {
  if (thinking && isReasoningStreamModel(provider, modelName)) {
    return REASONING_FIRST_TOKEN_DEADLINE_MS;
  }
  if (provider === 'litellm') return LITELLM_FIRST_TOKEN_DEADLINE_MS;
  return FIRST_TOKEN_DEADLINE_MS;
}

interface ModelResolution {
  model: LanguageModel;
  provider: string;
  modelName: string;
  /** User-facing model ID (key in AVAILABLE_MODELS), if set by the user. */
  modelId?: string;
  /** Single-step first-token-timeout fallback target. For overflow lanes,
   *  this is the unchosen sibling (Verdigado↔Regolo). */
  sibling?: { provider: string; model: string };
  /** Set when this resolution acquired the Verdigado overflow slot. MUST be
   *  invoked after the stream completes (success, failure, abort). */
  releaseSlot?: () => Promise<void>;
  /** Set when the user requested a modelId the registry doesn't know and the
   *  agent default was used instead — callers surface this to the client so
   *  the selection isn't ignored silently. */
  unknownModelId?: string;
  /** Reasoning strength for this turn, from the auto policy (or the default
   *  for an explicit user selection). `off` means do not think at all. */
  reasoningEffort: ReasoningSetting;
  /** True when the auto policy — not the user — picked this model. The loop
   *  uses it to know a deliberate choice was already made for the synth slot. */
  fromAutoPolicy: boolean;
  /** Context window of the RESOLVED lane. Callers computing token budgets
   *  before the model was known (streamContext runs pre-classifier, so `auto`
   *  yields the conservative default there) should prefer this. Absent when
   *  the agent default was used and no registry entry applied. */
  contextWindow?: number;
}

/** Explicit user selections keep the previous behaviour: think when the model
 *  can. Only `auto` turns are graded by intent + complexity. */
const EXPLICIT_SELECTION_REASONING: ReasoningSetting = 'high';

/**
 * Mistral's dial is BINARY: `@ai-sdk/mistral` validates reasoningEffort against
 * `'high' | 'none'` and throws a ZodError on 'low'/'medium' (verified live
 * against the API). Our 4-step scale therefore collapses here — anything below
 * `medium` means "don't think", which is also the honest reading of `low` on a
 * model that has no low setting.
 *
 * Returns null when no provider option should be sent at all.
 */
export function mistralReasoningOption(setting: ReasoningSetting): 'high' | null {
  return setting === 'medium' || setting === 'high' ? 'high' : null;
}

/**
 * Resolve which AI model to use.
 *
 * Order: explicit user selection → auto policy (intent + complexity) → agent
 * default. The vision override runs last and beats all of them.
 *
 * Async because the gpt-oss overflow lane acquires a Redis slot before choosing
 * Verdigado vs Regolo. requestId tags the slot for correct release. Gemma 4 is
 * no longer such a lane: it is pinned to Regolo and takes no slot, see
 * GEMMA_4_REGOLO in agents/providers.ts.
 */
export async function resolveModel(
  agentConfig: { provider: string; model: string; defaultModel?: string | undefined },
  modelId: string | undefined,
  requestId: string,
  options?: {
    hasImages?: boolean;
    intent?: string;
    complexity?: Complexity;
    /** Output contract on the turn (detectTaskShape) — lane override for the
     *  neutral intents, see resolveAutoSelection. */
    taskShape?: TaskShape | null;
    /** Characters of material the turn carries (`turnMaterialChars`) — routes
     *  document work to the precise lane and lifts reasoning, see
     *  resolveAutoSelection. */
    materialChars?: number | null;
    agentId?: string | null;
    /** For surfaces without a classifier (notebook) — see resolveAutoSelection. */
    surface?: 'notebook';
    /** Rough size of this request (see estimateRequestTokens). Above
     *  VERDIGADO_INPUT_LIMIT an overflow lane runs on its hosted side so the
     *  request isn't pruned down to the small lane's budget. */
    estimatedInputTokens?: number;
  }
): Promise<ModelResolution> {
  let modelProvider = agentConfig.provider;
  let modelName = agentConfig.model;
  let sibling: { provider: string; model: string } | undefined;
  let releaseSlot: (() => Promise<void>) | undefined;
  let resolvedId: string | undefined;
  let unknownModelId: string | undefined;
  let reasoningEffort: ReasoningSetting = EXPLICIT_SELECTION_REASONING;
  let fromAutoPolicy = false;
  let contextWindow: number | undefined;

  const isAuto = !modelId || modelId === 'mistral' || modelId === 'auto';

  const oversized = (options?.estimatedInputTokens ?? 0) > VERDIGADO_INPUT_LIMIT;
  const preferOverflow = oversized ? { preferOverflow: true } : {};
  if (oversized) {
    log.info(
      `[ChatGraph] input ~${Math.round((options?.estimatedInputTokens ?? 0) / 1000)}k tokens > ` +
        `${VERDIGADO_INPUT_LIMIT / 1000}k — overflow lanes run hosted (full window, no pruning)`
    );
  }

  if (!isAuto) {
    const tuple = await resolveModelTuple(modelId, requestId, preferOverflow);
    if (tuple) {
      modelProvider = tuple.provider;
      modelName = tuple.model;
      resolvedId = modelId;
      contextWindow = tuple.contextWindow;
      if (tuple.sibling) sibling = tuple.sibling;
      if (tuple.releaseSlot) releaseSlot = tuple.releaseSlot;
      log.info(`[ChatGraph] Using user-selected model: ${modelId} → ${modelProvider}/${modelName}`);
    } else {
      log.warn(`[ChatGraph] Unknown model ID "${modelId}", using agent default`);
      unknownModelId = modelId;
    }
  } else {
    // Auto: the classifier has already run, so the intent is known here. This
    // is the whole point of resolving auto on the server instead of the client.
    const selection = resolveAutoSelection({
      ...(options?.intent != null && { intent: options.intent }),
      ...(options?.complexity != null && { complexity: options.complexity }),
      ...(options?.taskShape != null && { taskShape: options.taskShape }),
      ...(options?.materialChars != null && { materialChars: options.materialChars }),
      ...(options?.agentId != null && { agentId: options.agentId }),
      ...(options?.surface != null && { surface: options.surface }),
    });
    reasoningEffort = selection.reasoning;
    const tuple = await resolveModelTuple(selection.modelId, requestId, preferOverflow);
    if (tuple) {
      modelProvider = tuple.provider;
      modelName = tuple.model;
      resolvedId = selection.modelId;
      contextWindow = tuple.contextWindow;
      fromAutoPolicy = true;
      if (tuple.sibling) sibling = tuple.sibling;
      if (tuple.releaseSlot) releaseSlot = tuple.releaseSlot;
      log.info(
        `[ChatGraph] auto → ${selection.modelId} (${modelProvider}/${modelName}) ` +
          `intent=${options?.intent ?? 'none'} complexity=${options?.complexity ?? 'simple'} ` +
          `reasoning=${selection.reasoning}${options?.taskShape ? ` taskShape=${options.taskShape}` : ''}` +
          `${options?.materialChars ? ` material=${options.materialChars}c` : ''}`
      );
    } else {
      // The policy names a lane that is not in AVAILABLE_MODELS — a code bug,
      // not user input. Fall back to the agent default rather than failing.
      log.error(
        `[ChatGraph] auto policy returned unknown lane "${selection.modelId}" — using agent default`
      );
    }
  }

  // For image_edit, the chat model narrates from pre-grounded BILDVERGLEICH
  // text descriptions (set by imageEditNode via VisionService) — it does NOT
  // need to see the raw image. Skipping the vision-fallback keeps the user's
  // chosen (typically larger, more system-prompt-compliant) model in charge.
  // The controller MUST also skip injectImageAttachments for image_edit so the
  // non-vision model doesn't receive image bytes it can't decode.
  if (options?.intent === 'image_edit' && options.hasImages && !isVisionCapable(modelName)) {
    log.info(
      `[ChatGraph] image_edit intent — keeping user-selected model "${modelName}", BILDVERGLEICH descriptions provide grounding`
    );
  }

  // Vision override: only fire when the chosen primary AND its sibling both
  // lack vision support. Overflow lanes where both candidates are vision-
  // capable (e.g. Gemma 4: Verdigado/gemma + Regolo/gemma4-31b) skip the
  // override entirely so alternation isn't collapsed to a single provider.
  if (options?.hasImages && !isVisionCapable(modelName) && options.intent !== 'image_edit') {
    const siblingVisionOk = sibling ? isVisionCapable(sibling.model) : false;
    if (!siblingVisionOk) {
      log.info(
        `[ChatGraph] Images present but "${modelName}" lacks vision — switching to ${VISION_MODEL.provider}/${VISION_MODEL.model}`
      );
      // Releasing here: we're overriding away from a slot we just acquired.
      if (releaseSlot) {
        await releaseSlot();
        releaseSlot = undefined;
      }
      modelProvider = VISION_MODEL.provider;
      modelName = VISION_MODEL.model;
      sibling = undefined;
      resolvedId = undefined;
    } else if (sibling) {
      log.info(
        `[ChatGraph] Images present and "${modelName}" lacks vision but sibling "${sibling.model}" supports it — swapping within lane`
      );
      // Swap to the vision-capable sibling. Release the old slot if any.
      if (releaseSlot) {
        await releaseSlot();
        releaseSlot = undefined;
      }
      const newPrimary = sibling;
      sibling = { provider: modelProvider, model: modelName };
      modelProvider = newPrimary.provider;
      modelName = newPrimary.model;
    }
  }

  const result: ModelResolution = {
    // `needsReasoning` pins a thinking turn to the Mistral API. The Scaleway
    // upstream is reached through @ai-sdk/openai, which never receives the
    // `providerOptions.mistral` block set further down (see the streamOnce
    // call site), so the effort would be dropped without a trace — no error,
    // no reasoning, nothing in the logs. See routeMistralModel.
    model: getModel(modelProvider, modelName, {
      needsReasoning:
        modelProvider === 'mistral' &&
        isReasoningCapable(modelName) &&
        mistralReasoningOption(reasoningEffort) !== null,
    }),
    provider: modelProvider,
    modelName,
    reasoningEffort,
    fromAutoPolicy,
  };
  if (resolvedId) result.modelId = resolvedId;
  if (sibling) result.sibling = sibling;
  if (releaseSlot) result.releaseSlot = releaseSlot;
  if (unknownModelId) result.unknownModelId = unknownModelId;
  if (contextWindow != null) result.contextWindow = contextWindow;
  return result;
}

/** Convenience type: see ResolvedModelTuple in providers.ts. */
export type { ResolvedModelTuple };

/**
 * Build the final messages array for the AI model.
 * Prepends the system message and strips empty assistant messages.
 */
export function buildMessagesForAI(
  systemMessage: string,
  contextMessages: Array<{ role: string; content: string | unknown[] }>
): Array<{ role: string; content: string | unknown[] }> {
  const messages = [{ role: 'system', content: systemMessage }, ...contextMessages];
  return sanitizeContentPartsForModel(stripEmptyAssistantMessages(messages as ModelMessage[]));
}

/**
 * Hoist any role:'system' entries out of `messages` into a single concatenated
 * `system` string. The Vercel AI SDK warns (and may eventually error) when
 * system messages are passed inside the `messages` array, since they're a
 * potential prompt-injection vector if user content ever leaks into history.
 */
function extractSystemFromMessages(messages: ModelMessage[]): {
  system: string | undefined;
  messages: ModelMessage[];
} {
  const systemParts: string[] = [];
  const rest: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      const c = msg.content;
      systemParts.push(typeof c === 'string' ? c : String(c));
      continue;
    }
    rest.push(msg);
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: rest,
  };
}

class FirstTokenTimeoutError extends Error {
  readonly kind: FallbackReason = 'first_token_timeout';
  constructor(deadlineMs: number) {
    super(`No content token received within ${deadlineMs}ms`);
    this.name = 'FirstTokenTimeoutError';
  }
}

class EmptyCompletionError extends Error {
  readonly kind: FallbackReason = 'empty_completion';
  constructor() {
    super('Stream completed with empty content');
    this.name = 'EmptyCompletionError';
  }
}

/**
 * Sentinel error thrown when the primary model fails to produce output AND
 * no text_delta has been emitted yet. Caller catches this to trigger fallback.
 */
export type StreamFailure = FirstTokenTimeoutError | EmptyCompletionError;

export function isStreamFailure(err: unknown): err is StreamFailure {
  return err instanceof FirstTokenTimeoutError || err instanceof EmptyCompletionError;
}

/**
 * The first-token deadline: rejects with FirstTokenTimeoutError once the model
 * has been SILENT for `deadlineMs`, aborts the stream at the same moment, and
 * `clear()` disarms both when the first real text chunk arrives.
 *
 * The idle semantics (and why they are idle rather than one-shot) live in
 * {@link createIdleDeadline}, which the agentic loop's synth phase shares — one
 * definition of "stalled" for both answer paths.
 */
function createFirstTokenDeadline(deadlineMs: number): IdleDeadline {
  return createIdleDeadline(deadlineMs, () => new FirstTokenTimeoutError(deadlineMs));
}

/** A plain abort-after-ms timer (setTimeout-backed so fake timers drive it,
 *  unlike AbortSignal.timeout). Clearable so a normal completion frees it. */
function createAbortTimer(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const handle = setTimeout(() => {
    controller.abort(new DOMException(`wall-clock ${ms}ms exceeded`, 'TimeoutError'));
  }, ms);
  return { signal: controller.signal, clear: () => clearTimeout(handle) };
}

async function streamAndAccumulateOrThrow(params: {
  model: LanguageModel;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
  providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
  telemetry?: Parameters<typeof streamText>[0]['experimental_telemetry'];
  firstTokenDeadlineMs?: number;
  wallClockMs?: number;
}): Promise<string | null> {
  const {
    model,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    logPrefix = '[ChatGraph]',
    providerOptions,
    telemetry,
    firstTokenDeadlineMs = FIRST_TOKEN_DEADLINE_MS,
    wallClockMs = SINGLE_PASS_WALL_CLOCK_MS,
  } = params;

  const {
    deadline,
    signal: deadlineSignal,
    clear,
    touch,
  } = createFirstTokenDeadline(firstTokenDeadlineMs);
  // Turn wall-clock: bounds BOTH phases (the first-token deadline is cleared
  // after phase 1, leaving the drain uncapped). Cleared on normal completion.
  const wall = createAbortTimer(wallClockMs);
  const composed = AbortSignal.any([...(signal ? [signal] : []), deadlineSignal, wall.signal]);

  const { system, messages: messagesWithoutSystem } = extractSystemFromMessages(
    messages as ModelMessage[]
  );

  const result = streamText({
    model,
    ...(system != null && { system }),
    messages: messagesWithoutSystem,
    ...(maxTokens != null && { maxOutputTokens: maxTokens }),
    temperature,
    abortSignal: composed,
    ...(providerOptions && { providerOptions }),
    ...(telemetry && { experimental_telemetry: telemetry }),
  });

  // fullStream (not textStream) so reasoning models surface their thinking as
  // `reasoning_delta` SSE events alongside the answer. A reasoning delta REARMS
  // the first-token deadline (the model is demonstrably alive) rather than
  // disarming it — disarming gave up the clean fallback at the very first
  // reasoning token, after which only the 180s wall clock bounded a hang. Only
  // a `text-delta` ends phase 1; until visible answer text is on the wire we
  // can still fall back cleanly.
  const iterator = result.stream[Symbol.asyncIterator]();
  let fullText = '';
  let textStarted = false;
  const stopHeartbeat = startResponseHeartbeat(sse);

  // Phase 1 — race the shared deadline until the first visible text delta.
  // Some providers emit empty/structural parts (start, text-start, …) and a
  // reasoning preamble first; we keep racing against the SAME timeout until
  // text arrives or the deadline fires.
  try {
    while (!textStarted) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (next.done) throw new EmptyCompletionError();
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        // Alive, but not answering yet: rearm the idle window and let the real
        // reasoning deltas replace the heartbeat as the UI's proof of progress.
        touch();
        stopHeartbeat();
        sse.send('reasoning_delta', { text: part.text });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        clear();
        stopHeartbeat();
        fullText += part.text;
        sse.send('text_delta', { text: part.text });
        textStarted = true;
      }
    }
  } catch (err) {
    clear();
    wall.clear();
    stopHeartbeat();
    throw err;
  }

  // Phase 2 — visible text is on the wire; just drain. Errors here can't
  // trigger a clean fallback, so they end the stream gracefully.
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        sse.send('reasoning_delta', { text: part.text });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        fullText += part.text;
        sse.send('text_delta', { text: part.text });
      }
    }
  } catch (streamError: unknown) {
    wall.clear();
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(
      `${logPrefix} Stream error after first token (${fullText.length} chars):`,
      errorMessage
    );
    sse.send('error', {
      error: PROGRESS_MESSAGES.streamInterrupted,
      code: 'stream_interrupted',
      retryable: true,
    });
    sse.end();
    return null;
  }

  wall.clear();
  return fullText;
}

/**
 * Internal: same as streamAndAccumulateOrThrow but for the Regolo
 * reasoning-aware path. Throws StreamFailure on first-token failure.
 */
async function streamAndAccumulateWithReasoningOrThrow(params: {
  provider: string;
  modelName: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
  firstTokenDeadlineMs?: number;
  wallClockMs?: number;
  effort?: ThinkingEffort;
}): Promise<string | null> {
  const {
    provider,
    modelName,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    effort,
    logPrefix = '[ChatGraph]',
    firstTokenDeadlineMs = FIRST_TOKEN_DEADLINE_MS,
    wallClockMs = SINGLE_PASS_WALL_CLOCK_MS,
  } = params;

  const {
    deadline,
    signal: deadlineSignal,
    clear,
    touch,
  } = createFirstTokenDeadline(firstTokenDeadlineMs);
  // Turn wall-clock: bounds BOTH phases (the first-token deadline is cleared
  // after phase 1, leaving the drain uncapped). Cleared on normal completion.
  const wall = createAbortTimer(wallClockMs);
  const composed = AbortSignal.any([...(signal ? [signal] : []), deadlineSignal, wall.signal]);

  const streamParams: Parameters<typeof streamWithReasoning>[0] = {
    provider,
    model: modelName,
    messages: messages as ModelMessage[],
    ...(maxTokens != null && { maxTokens }),
    temperature,
    signal: composed,
    ...(effort && { effort }),
  };

  const iterator = streamWithReasoning(streamParams)[Symbol.asyncIterator]();
  let fullText = '';
  const stopHeartbeat = startResponseHeartbeat(sse);

  // Phase 1 — race against the deadline until the first TEXT chunk. Reasoning
  // chunks pass through as reasoning_delta but don't satisfy the deadline:
  // a model that only ever emits reasoning is functionally hung.
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (next.done) throw new EmptyCompletionError();
      const chunk = next.value;
      if (chunk.type === 'text') {
        clear();
        stopHeartbeat();
        fullText += chunk.delta;
        sse.send('text_delta', { text: chunk.delta });
        break;
      }
      // Thinking out loud is proof of life — rearm rather than time out.
      touch();
      sse.send('reasoning_delta', { text: chunk.delta });
    }
  } catch (err) {
    clear();
    wall.clear();
    stopHeartbeat();
    throw err;
  }

  // Phase 2 — first text chunk is in. Drain without deadline.
  try {
    while (true) {
      const { done, value } = await iterator.next();
      if (done) break;
      if (value.type === 'text') {
        fullText += value.delta;
        sse.send('text_delta', { text: value.delta });
      } else {
        sse.send('reasoning_delta', { text: value.delta });
      }
    }
  } catch (streamError: unknown) {
    wall.clear();
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(`${logPrefix} Reasoning stream error after first token:`, errorMessage);
    sse.send('error', {
      error: PROGRESS_MESSAGES.streamInterrupted,
      code: 'stream_interrupted',
      retryable: true,
    });
    sse.end();
    return null;
  }

  wall.clear();
  return fullText;
}

const GENERIC_GENERATION_ERROR =
  'Antwort konnte nicht generiert werden. Bitte später erneut versuchen.';

function failStream(sse: SSEWriter, kind?: StreamFailure['kind']): null {
  sse.send('error', {
    error: GENERIC_GENERATION_ERROR,
    code: kind === 'first_token_timeout' ? 'first_token_timeout' : 'provider_unavailable',
    retryable: true,
  });
  sse.end();
  return null;
}

function wrapWithCompatCatch<P extends { sse: SSEWriter; logPrefix?: string }>(
  impl: (params: P) => Promise<string | null>,
  label: string
): (params: P) => Promise<string | null> {
  return async (params) => {
    try {
      return await impl(params);
    } catch (err) {
      if (isStreamFailure(err)) {
        log.warn(`${params.logPrefix ?? '[ChatGraph]'} ${label}: ${err.kind} — ${err.message}`);
        return failStream(params.sse, err.kind);
      }
      throw err;
    }
  };
}

export const streamAndAccumulate = wrapWithCompatCatch(streamAndAccumulateOrThrow, 'Stream failed');
export const streamAndAccumulateWithReasoning = wrapWithCompatCatch(
  streamAndAccumulateWithReasoningOrThrow,
  'Reasoning stream failed'
);

/**
 * Stream from a primary model with single-step fallback to its sibling on
 * first-token failure. The sibling is set by resolveModel() — for overflow
 * lanes it's the unchosen Verdigado/Regolo partner; for single configs
 * without a sibling, no fallback fires (Qwen "Chinese-only-when-selected"
 * firewall: never auto-route INTO Qwen, never silently auto-route OUT).
 *
 * Single-step by design: the fallback's buildStream is invoked directly, not
 * via a recursive streamWithFallback. Do not refactor to recurse.
 */
export async function streamWithFallback(params: {
  primary: ModelResolution;
  buildStream: (resolution: ModelResolution) => Promise<string | null>;
  sse: SSEWriter;
  logPrefix?: string;
  /**
   * Last resort when BOTH lanes are dead: a caller that already holds a usable
   * answer returns it here and the turn completes normally instead of erroring.
   * Research wrapper-mode is the case that motivates it — the retrieved
   * synthesis IS the answer and is already on screen as a card, so failing the
   * turn discards work the user can see and we already paid for.
   *
   * Returning null (or omitting this) keeps the plain error.
   */
  salvage?: () => string | null;
}): Promise<string | null> {
  const { primary, buildStream, sse, logPrefix = '[ChatGraph]', salvage } = params;
  const primaryLabel = primary.modelId ?? primary.modelName;

  /** Emit the salvaged answer on the normal text channel so the caller's
   *  persistence, citation clamp and reload path all treat it as a real turn. */
  const salvageOrFail = (kind: StreamFailure['kind']): string | null => {
    const rescued = salvage?.() ?? null;
    if (rescued == null || rescued.trim().length === 0) return failStream(sse, kind);
    log.warn(`${logPrefix} both lanes failed (${kind}) — salvaging the answer already retrieved`);
    sse.send('text_delta', { text: rescued });
    return rescued;
  };

  try {
    return await buildStream(primary);
  } catch (err) {
    if (!isStreamFailure(err)) throw err;

    const sibling = primary.sibling;
    if (!sibling) {
      log.warn(`${logPrefix} ${primaryLabel} failed (${err.kind}) — no sibling configured`);
      return salvageOrFail(err.kind);
    }

    log.warn(
      `${logPrefix} ${primaryLabel} failed (${err.kind}) → falling back to ${sibling.provider}/${sibling.model}`
    );

    // Client receives only IDs. Display names are resolved client-side.
    const fallbackLabel = `${sibling.provider}/${sibling.model}`;
    sse.send('fallback', {
      from: { id: primaryLabel, name: primaryLabel },
      to: { id: fallbackLabel, name: fallbackLabel },
      reason: err.kind,
    });

    const fallbackResolution: ModelResolution = {
      model: getModel(sibling.provider, sibling.model),
      provider: sibling.provider,
      modelName: sibling.model,
      // The turn's task hasn't changed, only the host — keep the policy's
      // reasoning setting so the fallback doesn't silently start thinking.
      reasoningEffort: primary.reasoningEffort,
      fromAutoPolicy: primary.fromAutoPolicy,
    };
    if (primary.modelId) fallbackResolution.modelId = primary.modelId;

    try {
      return await buildStream(fallbackResolution);
    } catch (fallbackErr) {
      if (isStreamFailure(fallbackErr)) {
        log.error(`${logPrefix} Fallback ${fallbackLabel} also failed (${fallbackErr.kind})`);
        return salvageOrFail(fallbackErr.kind);
      }
      throw fallbackErr;
    }
  }
}

/**
 * Dispatch entry point paired with streamWithFallback. Routes reasoning-capable
 * lanes through the reasoning-aware streamer; everything else through the
 * standard AI SDK path.
 *
 * Reasoning has three different shapes upstream, all driven by the single
 * `resolution.reasoningEffort` value:
 *   - Mistral: a per-request `reasoningEffort` provider option.
 *   - Regolo (vLLM): the `enable_thinking` chat-template flag.
 *   - LiteLLM/Ollama: thinking is ON by default; `off` means taking the SDK
 *     path instead, which sets `think: false` via litellmFetchWithThinkingDisabled.
 */
export async function streamForResolution(params: {
  resolution: ModelResolution;
  messages: Array<{ role: string; content: string | unknown[] }>;
  /** Optional output cap. Omit on answer paths — the provider decides. */
  maxTokens?: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
  telemetry?: Parameters<typeof streamText>[0]['experimental_telemetry'];
}): Promise<string | null> {
  const { resolution, messages, maxTokens, temperature, sse, signal, logPrefix, telemetry } =
    params;

  const thinking = resolution.reasoningEffort !== 'off';
  const firstTokenDeadlineMs = getFirstTokenDeadlineMs(
    resolution.provider,
    resolution.modelName,
    thinking
  );

  // `off` deliberately skips the reasoning streamer entirely: for the lanes
  // that stream thinking by default (verdigado-pro/-think, the Regolo family)
  // that is the ONLY way to actually stop them from thinking, and it is what
  // makes `direct` a real speed path.
  if (thinking && isReasoningStreamModel(resolution.provider, resolution.modelName)) {
    // Regolo reasoning path is a raw fetch (regoloReasoningStream), not the AI
    // SDK — no experimental_telemetry hook, so it stays uninstrumented for now.
    const args: Parameters<typeof streamAndAccumulateWithReasoningOrThrow>[0] = {
      provider: resolution.provider,
      modelName: resolution.modelName,
      messages,
      ...(maxTokens != null && { maxTokens }),
      temperature,
      sse,
      firstTokenDeadlineMs,
    };
    if (signal) args.signal = signal;
    if (logPrefix) args.logPrefix = logPrefix;
    // `thinking` is true here, so the setting is one of low/medium/high.
    args.effort = resolution.reasoningEffort as ThinkingEffort;
    try {
      return await streamAndAccumulateWithReasoningOrThrow(args);
    } catch (err) {
      // Only the Mistral lane has a second home: Scaleway serves its thinking
      // turns, and `resolution.model` is already the Mistral API model (see
      // the needsReasoning pin in resolveModel), so falling through to the SDK
      // path below re-runs the turn against Mistral with reasoning intact.
      // Every other lane has nowhere to fall back to, so its error propagates.
      //
      // Safe only because ReasoningStreamUnavailableError means the upstream
      // never answered — nothing has reached the user's screen yet. A
      // mid-stream failure throws a plain Error and is deliberately not caught
      // here; retrying would replay tokens the user has already seen.
      if (resolution.provider !== 'mistral' || !(err instanceof ReasoningStreamUnavailableError)) {
        throw err;
      }
      log.warn(
        `${logPrefix ?? '[ChatGraph]'} Scaleway reasoning unavailable (${err.status}) — falling back to the Mistral API`
      );
    }
  }

  const args: Parameters<typeof streamAndAccumulateOrThrow>[0] = {
    model: resolution.model,
    messages,
    ...(maxTokens != null && { maxTokens }),
    temperature,
    sse,
    firstTokenDeadlineMs,
  };
  if (signal) args.signal = signal;
  if (logPrefix) args.logPrefix = logPrefix;
  if (telemetry) args.telemetry = telemetry;
  // Mistral reasoning models (e.g. Medium 3.5) only think when `reasoningEffort`
  // is set per request; @ai-sdk/mistral then surfaces the reasoning via
  // fullStream so streamAndAccumulateOrThrow can emit it as reasoning_delta.
  if (thinking && resolution.provider === 'mistral' && isReasoningCapable(resolution.modelName)) {
    const mistralEffort = mistralReasoningOption(resolution.reasoningEffort);
    if (mistralEffort) args.providerOptions = { mistral: { reasoningEffort: mistralEffort } };
  }
  return streamAndAccumulateOrThrow(args);
}
