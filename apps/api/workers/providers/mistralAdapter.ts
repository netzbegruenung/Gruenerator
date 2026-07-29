/**
 * Mistral AI Adapter
 * Uses Vercel AI SDK for text generation with content-type specific configurations
 */

import { generateText, type ModelMessage } from 'ai';

import { getGenerationConfig, type GenerationOptions } from '../../services/ai/config.js';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import {
  buildAiSdkTools,
  buildAdapterResult,
  convertMessages,
  resolveToolChoice,
} from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult } from '../types.js';

// Connection metrics for monitoring
/**
 * `retries` is deliberately absent: the AI SDK owns retrying now and does not
 * report how many attempts it made, so a counter here could only ever report
 * 0 — which reads as "no retries happened" rather than "not measured".
 */
export interface ConnectionMetrics {
  attempts: number;
  successes: number;
  failures: number;
  lastFailureTime: number | null;
  lastFailureReason: string | null;
}

export const connectionMetrics: ConnectionMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  lastFailureTime: null,
  lastFailureReason: null,
};

/**
 * Execute a Mistral AI request using Vercel AI SDK
 */
async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  // Check provider availability
  if (!isProviderConfigured('mistral')) {
    throw new Error(
      'Mistral provider is not configured. Check MISTRAL_API_KEY environment variable.'
    );
  }

  const model = options.model || 'mistral-medium-2604';
  const platforms = (requestMetadata as { platforms?: string[] }).platforms;

  // Get content-type specific configuration
  const generationOptions: GenerationOptions = {
    type,
    systemPrompt,
    platforms,
    temperature: options.temperature,
    maxTokens: options.max_tokens,
    topP: options.top_p,
  };

  let config = getGenerationConfig(generationOptions);

  // Mistral requires top_p=1 when temperature=0 (greedy sampling)
  if (config.temperature === 0 && config.topP !== 1) {
    config = { ...config, topP: 1.0 };
  }

  // Convert messages to Vercel AI SDK format
  const { system, messages: modelMessages } = await convertMessages(messages, systemPrompt);

  // Prepare tools - only include options that are not null/undefined
  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    'mistral',
    requestId,
    type
  );
  const tools = buildAiSdkTools(toolsPayload);

  const toolChoice = tools ? resolveToolChoice(toolsPayload.tool_choice) : undefined;

  // Get the model instance
  const aiModel = getModel('mistral', model);

  // Retries are the SDK's job. `maxRetries: 2` = 3 attempts total, exactly what
  // the hand-rolled loop this replaced did, with the same 2s/4s exponential
  // backoff. What changes is HOW retryability is decided: the old loop matched
  // substrings against the error message ('fetch failed', 'socket', 'rate
  // limit', 'timeout'), so a provider that reworded its errors silently stopped
  // being retried. The SDK inspects the structured APICallError instead.
  connectionMetrics.attempts++;

  try {
    const result = await generateText({
      model: aiModel,
      ...(system != null && { system }),
      messages: modelMessages,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
      topP: config.topP,
      maxRetries: 2,
      ...(tools != null && { tools }),
      ...(toolChoice != null && { toolChoice }),
    });

    connectionMetrics.successes++;

    return buildAdapterResult({
      provider: 'mistral',
      model,
      requestId,
      type,
      requestMetadata,
      result,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; cause?: { code?: string } };
    connectionMetrics.failures++;
    connectionMetrics.lastFailureTime = Date.now();
    connectionMetrics.lastFailureReason = err.message || 'Unknown error';

    console.error(`[mistralAdapter ${requestId}] Request failed after retries:`, {
      message: err.message,
      code: err.code || err.cause?.code,
    });
    throw error;
  }
}

export { execute };
