/**
 * Response Streaming Service
 *
 * Handles AI model resolution and text streaming:
 * - Model selection (user override vs agent default)
 * - Building the final messages array for AI
 * - Streaming text via SSE with error handling
 */

import { streamText } from 'ai';

import { createLogger } from '../../../utils/logger.js';
import { getModel, getModelConfig } from '../agents/providers.js';

import { stripEmptyAssistantMessages } from './messageHelpers.js';
import { PROGRESS_MESSAGES } from './sseHelpers.js';

import type { SSEWriter } from './sseHelpers.js';
import type { LanguageModel } from 'ai';

const log = createLogger('ResponseStreaming');

interface ModelResolution {
  model: LanguageModel;
  provider: string;
  modelName: string;
}

/**
 * Resolve which AI model to use: user selection overrides agent default.
 */
export function resolveModel(agentConfig: any, modelId?: string): ModelResolution {
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
export function buildMessagesForAI(systemMessage: string, contextMessages: any[]): any[] {
  const messages = [{ role: 'system', content: systemMessage }, ...contextMessages];
  return stripEmptyAssistantMessages(messages);
}

/**
 * Stream text from the AI model and accumulate the full response.
 * Sends text_delta SSE events for each chunk.
 * Returns the accumulated full text, or null if stream errored.
 */
export async function streamAndAccumulate(params: {
  model: LanguageModel;
  messages: any[];
  maxTokens: number;
  temperature: number;
  sse: SSEWriter;
  logPrefix?: string;
}): Promise<string | null> {
  const { model, messages, maxTokens, temperature, sse, logPrefix = '[ChatGraph]' } = params;

  const result = streamText({
    model,
    messages,
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
