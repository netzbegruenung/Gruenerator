/**
 * Response Streaming Service
 *
 * Handles AI model resolution and text streaming:
 * - Model selection (user override vs agent default)
 * - Building the final messages array for AI
 * - Streaming text via SSE with error handling
 */

import { streamText, type ModelMessage, type LanguageModel } from 'ai';

import { streamRegoloWithReasoning } from '../../../services/ai/regoloReasoningStream.js';
import { createLogger } from '../../../utils/logger.js';
import { getModel, getModelConfig, VISION_MODEL, isVisionCapable } from '../agents/providers.js';

import { sanitizeContentPartsForModel, stripEmptyAssistantMessages } from './messageHelpers.js';
import { PROGRESS_MESSAGES } from './sseHelpers.js';

import type { SSEWriter } from './sseHelpers.js';

const log = createLogger('ResponseStreaming');

interface ModelResolution {
  model: LanguageModel;
  provider: string;
  modelName: string;
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

  if (modelId && modelId !== 'mistral' && modelId !== 'auto') {
    const userModelConfig = getModelConfig(modelId);
    if (userModelConfig) {
      modelProvider = userModelConfig.provider;
      modelName = userModelConfig.model;
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
  }

  return {
    model: getModel(modelProvider, modelName),
    provider: modelProvider,
    modelName,
  };
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

/**
 * Stream text from the AI model and accumulate the full response.
 * Sends text_delta SSE events for each chunk.
 * Returns the accumulated full text, or null if stream errored.
 */
export async function streamAndAccumulate(params: {
  model: LanguageModel;
  messages: Array<{ role: string; content: string | unknown[] }>;
  maxTokens: number;
  temperature: number;
  sse: SSEWriter;
  logPrefix?: string;
}): Promise<string | null> {
  const { model, messages, maxTokens, temperature, sse, logPrefix = '[ChatGraph]' } = params;

  const result = streamText({
    model,
    messages: messages as ModelMessage[],
    maxOutputTokens: maxTokens,
    temperature,
  });

  let fullText = '';

  try {
    for await (const chunk of result.textStream) {
      fullText += chunk;
      sse.send('text_delta', { text: chunk });
    }
  } catch (streamError: unknown) {
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(`${logPrefix} Stream error:`, errorMessage);
    sse.send('error', { error: PROGRESS_MESSAGES.streamInterrupted });
    sse.end();
    return null;
  }

  return fullText;
}

/**
 * Stream directly from Regolo using the custom reasoning-aware bridge.
 * Emits `text_delta` for answer chunks and `reasoning_delta` for thinking
 * chunks, so the frontend's Reasoning/ReasoningGroup UI can render both.
 * Returns the accumulated answer text, or null on error.
 */
export async function streamAndAccumulateWithReasoning(params: {
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

  let fullText = '';

  try {
    const streamParams: Parameters<typeof streamRegoloWithReasoning>[0] = {
      model: modelName,
      messages: messages as ModelMessage[],
      maxTokens,
      temperature,
    };
    if (signal) streamParams.signal = signal;

    for await (const chunk of streamRegoloWithReasoning(streamParams)) {
      if (chunk.type === 'text') {
        fullText += chunk.delta;
        sse.send('text_delta', { text: chunk.delta });
      } else {
        sse.send('reasoning_delta', { text: chunk.delta });
      }
    }
  } catch (streamError: unknown) {
    const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
    log.error(`${logPrefix} Reasoning stream error:`, errorMessage);
    sse.send('error', { error: PROGRESS_MESSAGES.streamInterrupted });
    sse.end();
    return null;
  }

  return fullText;
}
