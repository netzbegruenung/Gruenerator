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
  isRegoloReasoningModel,
  streamRegoloWithReasoning,
} from '../../../services/ai/regoloReasoningStream.js';
import { createLogger } from '../../../utils/logger.js';
import {
  getModel,
  resolveModelTuple,
  VISION_MODEL,
  isVisionCapable,
  type ResolvedModelTuple,
} from '../agents/providers.js';

import { sanitizeContentPartsForModel, stripEmptyAssistantMessages } from './messageHelpers.js';
import { PROGRESS_MESSAGES, type FallbackReason, type SSEWriter } from './sseHelpers.js';

const log = createLogger('ResponseStreaming');

/**
 * How long to wait for the first content token before declaring the upstream
 * model dead and triggering fallback. Set generously enough to accommodate
 * gemma's reasoning preamble on LiteLLM (~10s observed), with headroom for
 * production load.
 */
const FIRST_TOKEN_DEADLINE_MS = 20_000;

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
}

/**
 * Resolve which AI model to use: user selection overrides agent default.
 *
 * Async because overflow lanes (gpt-oss, gemma-4) acquire a Redis slot before
 * choosing Verdigado vs Regolo. requestId tags the slot for correct release.
 */
export async function resolveModel(
  agentConfig: { provider: string; model: string; defaultModel?: string | undefined },
  modelId: string | undefined,
  requestId: string,
  options?: { hasImages?: boolean; intent?: string }
): Promise<ModelResolution> {
  let modelProvider = agentConfig.provider;
  let modelName = agentConfig.model;
  let sibling: { provider: string; model: string } | undefined;
  let releaseSlot: (() => Promise<void>) | undefined;
  let resolvedId: string | undefined;

  if (modelId && modelId !== 'mistral' && modelId !== 'auto') {
    const tuple = await resolveModelTuple(modelId, requestId);
    if (tuple) {
      modelProvider = tuple.provider;
      modelName = tuple.model;
      resolvedId = modelId;
      if (tuple.sibling) sibling = tuple.sibling;
      if (tuple.releaseSlot) releaseSlot = tuple.releaseSlot;
      log.info(`[ChatGraph] Using user-selected model: ${modelId} → ${modelProvider}/${modelName}`);
    } else {
      log.warn(`[ChatGraph] Unknown model ID "${modelId}", using agent default`);
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
    model: getModel(modelProvider, modelName),
    provider: modelProvider,
    modelName,
  };
  if (resolvedId) result.modelId = resolvedId;
  if (sibling) result.sibling = sibling;
  if (releaseSlot) result.releaseSlot = releaseSlot;
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
  constructor() {
    super(`No content token received within ${FIRST_TOKEN_DEADLINE_MS}ms`);
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
 * Heartbeat while we wait for the first content token. Some primary models
 * spend several seconds in TTFB (especially overflow lanes / cold reasoning
 * starts); without a ping the UI shows `response_start` and nothing else,
 * which looks like a hang. Cleared on first delta, abort, or error.
 */
const HEARTBEAT_INTERVAL_MS = 3_000;

function startResponseHeartbeat(sse: SSEWriter): () => void {
  const stepId = `generating_${Date.now()}`;
  const handle = setInterval(() => {
    if (sse.isEnded()) return;
    sse.send('thinking_step', {
      stepId,
      toolName: 'generating',
      title: 'Formuliere Antwort…',
      status: 'in_progress',
    });
  }, HEARTBEAT_INTERVAL_MS);
  // Don't keep the event loop alive solely on this timer if the response is
  // aborted at the socket layer.
  if (typeof handle.unref === 'function') handle.unref();
  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    clearInterval(handle);
  };
}

/**
 * Set up a one-shot first-token deadline. Returns the deadline promise (which
 * rejects with FirstTokenTimeoutError after FIRST_TOKEN_DEADLINE_MS), an
 * abort signal that fires at the same time, and a clear() to disarm both
 * once the first real text chunk arrives.
 */
function createFirstTokenDeadline(): {
  deadline: Promise<never>;
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new FirstTokenTimeoutError());
    }, FIRST_TOKEN_DEADLINE_MS);
  });
  // Suppress unhandled-rejection if cleared before resolution.
  deadline.catch(() => {});
  return {
    deadline,
    signal: controller.signal,
    clear: () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    },
  };
}

async function streamAndAccumulateOrThrow(params: {
  model: LanguageModel;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
  providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
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
  } = params;

  const { deadline, signal: deadlineSignal, clear } = createFirstTokenDeadline();
  const composed = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;

  const { system, messages: messagesWithoutSystem } = extractSystemFromMessages(
    messages as ModelMessage[]
  );

  const result = streamText({
    model,
    ...(system != null && { system }),
    messages: messagesWithoutSystem,
    maxOutputTokens: maxTokens,
    temperature,
    abortSignal: composed,
    ...(providerOptions && { providerOptions }),
  });

  // fullStream (not textStream) so reasoning models surface their thinking as
  // `reasoning_delta` SSE events alongside the answer. A reasoning delta clears
  // the first-token deadline (the model is demonstrably alive), but only a
  // `text-delta` ends phase 1 — until visible answer text is on the wire we
  // can still fall back cleanly.
  const iterator = result.fullStream[Symbol.asyncIterator]();
  let fullText = '';
  let textStarted = false;
  let deadlineCleared = false;
  const stopHeartbeat = startResponseHeartbeat(sse);

  // Phase 1 — race the shared deadline until the first visible text delta.
  // Some providers emit empty/structural parts (start, text-start, …) and a
  // reasoning preamble first; we keep racing against the SAME timeout until
  // text arrives or the deadline fires.
  try {
    while (!textStarted) {
      const next = deadlineCleared
        ? await iterator.next()
        : await Promise.race([iterator.next(), deadline]);
      if (next.done) throw new EmptyCompletionError();
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        if (!deadlineCleared) {
          clear();
          stopHeartbeat();
          deadlineCleared = true;
        }
        sse.send('reasoning_delta', { text: part.text });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        if (!deadlineCleared) {
          clear();
          stopHeartbeat();
          deadlineCleared = true;
        }
        fullText += part.text;
        sse.send('text_delta', { text: part.text });
        textStarted = true;
      }
    }
  } catch (err) {
    clear();
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
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(
      `${logPrefix} Stream error after first token (${fullText.length} chars):`,
      errorMessage
    );
    sse.send('error', { error: PROGRESS_MESSAGES.streamInterrupted });
    sse.end();
    return null;
  }

  return fullText;
}

/**
 * Internal: same as streamAndAccumulateOrThrow but for the Regolo
 * reasoning-aware path. Throws StreamFailure on first-token failure.
 */
async function streamAndAccumulateWithReasoningOrThrow(params: {
  modelName: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
}): Promise<string | null> {
  const {
    modelName,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    logPrefix = '[ChatGraph]',
  } = params;

  const { deadline, signal: deadlineSignal, clear } = createFirstTokenDeadline();
  const composed = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;

  const streamParams: Parameters<typeof streamRegoloWithReasoning>[0] = {
    model: modelName,
    messages: messages as ModelMessage[],
    maxTokens,
    temperature,
    signal: composed,
  };

  const iterator = streamRegoloWithReasoning(streamParams)[Symbol.asyncIterator]();
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
      sse.send('reasoning_delta', { text: chunk.delta });
    }
  } catch (err) {
    clear();
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
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(`${logPrefix} Reasoning stream error after first token:`, errorMessage);
    sse.send('error', { error: PROGRESS_MESSAGES.streamInterrupted });
    sse.end();
    return null;
  }

  return fullText;
}

const GENERIC_GENERATION_ERROR =
  'Antwort konnte nicht generiert werden. Bitte später erneut versuchen.';

function failStream(sse: SSEWriter): null {
  sse.send('error', { error: GENERIC_GENERATION_ERROR });
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
        return failStream(params.sse);
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
}): Promise<string | null> {
  const { primary, buildStream, sse, logPrefix = '[ChatGraph]' } = params;
  const primaryLabel = primary.modelId ?? primary.modelName;

  try {
    return await buildStream(primary);
  } catch (err) {
    if (!isStreamFailure(err)) throw err;

    const sibling = primary.sibling;
    if (!sibling) {
      log.warn(`${logPrefix} ${primaryLabel} failed (${err.kind}) — no sibling configured`);
      return failStream(sse);
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
    };
    if (primary.modelId) fallbackResolution.modelId = primary.modelId;

    try {
      return await buildStream(fallbackResolution);
    } catch (fallbackErr) {
      if (isStreamFailure(fallbackErr)) {
        log.error(`${logPrefix} Fallback ${fallbackLabel} also failed (${fallbackErr.kind})`);
        return failStream(sse);
      }
      throw fallbackErr;
    }
  }
}

/**
 * Dispatch entry point paired with streamWithFallback. Routes Regolo
 * reasoning models through the reasoning-aware streamer; everything else
 * through the standard AI SDK path.
 */
export async function streamForResolution(params: {
  resolution: ModelResolution;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens: number;
  temperature: number;
  sse: SSEWriter;
  signal?: AbortSignal;
  logPrefix?: string;
}): Promise<string | null> {
  const { resolution, messages, maxTokens, temperature, sse, signal, logPrefix } = params;

  if (isRegoloReasoningModel(resolution.provider, resolution.modelName)) {
    const args: Parameters<typeof streamAndAccumulateWithReasoningOrThrow>[0] = {
      modelName: resolution.modelName,
      messages,
      maxTokens,
      temperature,
      sse,
    };
    if (signal) args.signal = signal;
    if (logPrefix) args.logPrefix = logPrefix;
    return streamAndAccumulateWithReasoningOrThrow(args);
  }

  const args: Parameters<typeof streamAndAccumulateOrThrow>[0] = {
    model: resolution.model,
    messages,
    maxTokens,
    temperature,
    sse,
  };
  if (signal) args.signal = signal;
  if (logPrefix) args.logPrefix = logPrefix;
  // Mistral reasoning models (e.g. Medium 3.5) only think when `reasoningEffort`
  // is set per request; @ai-sdk/mistral then surfaces the reasoning via
  // fullStream so streamAndAccumulateOrThrow can emit it as reasoning_delta.
  if (resolution.provider === 'mistral' && isReasoningCapable(resolution.modelName)) {
    args.providerOptions = { mistral: { reasoningEffort: 'high' } };
  }
  return streamAndAccumulateOrThrow(args);
}
