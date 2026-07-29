/**
 * LiteLLM AI Adapter
 * Uses Vercel AI SDK for text generation via OpenAI-compatible API
 */

import { generateText, type ModelMessage } from 'ai';

import { getDefaultModel, getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import {
  buildAiSdkTools,
  buildAdapterResult,
  convertMessages,
  resolveToolChoice,
} from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult } from '../types.js';

/**
 * Convert tool handler payload to Vercel AI SDK tools format
 */
/**
 * Execute a LiteLLM AI request using Vercel AI SDK
 */
async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  // Check provider availability
  if (!isProviderConfigured('litellm')) {
    throw new Error(
      'LiteLLM provider is not configured. Check LITELLM_BASE_URL and LITELLM_API_KEY environment variables.'
    );
  }

  const model = options.model || getDefaultModel('litellm');

  // Convert messages to Vercel AI SDK format
  const { system, messages: modelMessages } = await convertMessages(messages, systemPrompt);

  // Prepare tools - only include options that are not null/undefined
  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    'litellm',
    requestId,
    type
  );
  const tools = buildAiSdkTools(toolsPayload);

  const toolChoice = tools ? resolveToolChoice(toolsPayload.tool_choice) : undefined;

  // Get the model instance
  const aiModel = getModel('litellm', model);

  try {
    const result = await generateText({
      model: aiModel,
      ...(system != null && { system }),
      messages: modelMessages,
      ...(options.max_tokens != null && { maxOutputTokens: options.max_tokens }),
      // `??`, not `||`: 0 is a value a caller means, not a missing one.
      temperature: options.temperature ?? 0.7,
      topP: options.top_p ?? 1.0,
      ...(tools != null && { tools }),
      ...(toolChoice != null && { toolChoice }),
    });

    return buildAdapterResult({
      provider: 'litellm',
      model,
      requestId,
      type,
      requestMetadata,
      result,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`[litellmAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
