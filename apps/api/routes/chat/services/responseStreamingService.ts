/**
 * Response Streaming Service
 *
 * Handles AI model resolution and text streaming:
 * - Model selection (user override vs agent default)
 * - Building the final messages array for AI
 * - Streaming text via SSE with first-token deadline + cross-provider fallback
 */

import { streamText, type ModelMessage, type LanguageModel } from 'ai';

import {
  isRegoloReasoningModel,
  streamRegoloWithReasoning,
} from '../../../services/ai/regoloReasoningStream.js';
import { createLogger } from '../../../utils/logger.js';
import {
  getModel,
  getModelConfig,
  AVAILABLE_MODELS,
  VISION_MODEL,
  isVisionCapable,
  type ModelConfig,
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
  /** Resolved config from AVAILABLE_MODELS, if applicable. */
  config?: ModelConfig;
}

/**
 * Resolve which AI model to use: user selection overrides agent default.
 */
export function resolveModel(
  agentConfig: { provider: string; model: string; defaultModel?: string | undefined },
  modelId?: string,
  options?: { hasImages?: boolean }
): ModelResolution {
  let modelProvider = agentConfig.provider;
  let modelName = agentConfig.model;
  let resolvedConfig: ModelConfig | undefined;
  let resolvedId: string | undefined;

  if (modelId && modelId !== 'mistral' && modelId !== 'auto') {
    const userModelConfig = getModelConfig(modelId);
    if (userModelConfig) {
      modelProvider = userModelConfig.provider;
      modelName = userModelConfig.model;
      resolvedConfig = userModelConfig;
      resolvedId = modelId;
      log.info(`[ChatGraph] Using user-selected model: ${modelId} → ${modelProvider}/${modelName}`);
    } else {
      log.warn(`[ChatGraph] Unknown model ID "${modelId}", using agent default`);
    }
  }

  if (options?.hasImages && !isVisionCapable(modelName)) {
    log.info(
      `[ChatGraph] Images present but "${modelName}" lacks vision — switching to ${VISION_MODEL.provider}/${VISION_MODEL.model}`
    );
    modelProvider = VISION_MODEL.provider;
    modelName = VISION_MODEL.model;
    resolvedConfig = undefined;
    resolvedId = undefined;
  }

  const result: ModelResolution = {
    model: getModel(modelProvider, modelName),
    provider: modelProvider,
    modelName,
  };
  if (resolvedId) result.modelId = resolvedId;
  if (resolvedConfig) result.config = resolvedConfig;
  return result;
}

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
}): Promise<string | null> {
  const {
    model,
    messages,
    maxTokens,
    temperature,
    sse,
    signal,
    logPrefix = '[ChatGraph]',
  } = params;

  const { deadline, signal: deadlineSignal, clear } = createFirstTokenDeadline();
  const composed = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;

  const result = streamText({
    model,
    messages: messages as ModelMessage[],
    maxOutputTokens: maxTokens,
    temperature,
    abortSignal: composed,
  });

  const iterator = result.textStream[Symbol.asyncIterator]();
  let fullText = '';

  // Single shared deadline across all initial-probe iterations. Some providers
  // emit empty initial chunks before content; we keep racing against the SAME
  // timeout (not a fresh one each time) until either content arrives or the
  // deadline fires.
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (next.done) throw new EmptyCompletionError();
      if (next.value.length > 0) {
        clear();
        fullText += next.value;
        sse.send('text_delta', { text: next.value });
        break;
      }
    }
  } catch (err) {
    clear();
    throw err;
  }

  // Past the first real chunk: no more deadline races, just drain.
  try {
    while (true) {
      const { done, value } = await iterator.next();
      if (done) break;
      fullText += value;
      sse.send('text_delta', { text: value });
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
        fullText += chunk.delta;
        sse.send('text_delta', { text: chunk.delta });
        break;
      }
      sse.send('reasoning_delta', { text: chunk.delta });
    }
  } catch (err) {
    clear();
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
 * Stream from a primary model with single-step fallback to its configured
 * sibling on first-token failure. Models without a `fallback` field (Qwen)
 * skip the fallback — the "Chinese-only-when-selected" firewall: never auto-
 * route INTO Qwen, never silently auto-route OUT of Qwen.
 *
 * Note: AVAILABLE_MODELS contains intentional bidirectional fallback pairs
 * (gemma-litellm ↔ gpt-oss-regolo). This is safe because dispatch is
 * single-step — the fallback's own buildStream is invoked directly, not via
 * a recursive streamWithFallback. Do not refactor to recurse.
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

    const fallbackId = primary.config?.fallback;
    if (!fallbackId) {
      log.warn(`${logPrefix} ${primaryLabel} failed (${err.kind}) — no fallback configured`);
      return failStream(sse);
    }

    const fallbackConfig = AVAILABLE_MODELS[fallbackId];
    if (!fallbackConfig) {
      log.error(`${logPrefix} Fallback ID "${fallbackId}" missing from AVAILABLE_MODELS`);
      return failStream(sse);
    }

    log.warn(`${logPrefix} ${primaryLabel} failed (${err.kind}) → falling back to ${fallbackId}`);

    // Client receives only IDs. Display names are resolved client-side from
    // MODEL_OPTIONS (see packages/chat/src/stores/chatStore.ts) — keeps the
    // server out of the i18n/branding business and avoids a duplicated map.
    sse.send('fallback', {
      from: { id: primaryLabel, name: primaryLabel },
      to: { id: fallbackId, name: fallbackId },
      reason: err.kind,
    });

    const fallbackResolution: ModelResolution = {
      model: getModel(fallbackConfig.provider, fallbackConfig.model),
      provider: fallbackConfig.provider,
      modelName: fallbackConfig.model,
      modelId: fallbackId,
      config: fallbackConfig,
    };

    try {
      return await buildStream(fallbackResolution);
    } catch (fallbackErr) {
      if (isStreamFailure(fallbackErr)) {
        log.error(`${logPrefix} Fallback ${fallbackId} also failed (${fallbackErr.kind})`);
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
  return streamAndAccumulateOrThrow(args);
}
