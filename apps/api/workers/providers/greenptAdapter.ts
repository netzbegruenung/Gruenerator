/**
 * GreenPT Adapter
 * OpenAI-compatible API at api.greenpt.ai, driven through the Vercel AI SDK.
 */

import { generateText } from 'ai';

import { env } from '../../config/env.js';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import {
  buildAiSdkTools,
  buildAdapterResult,
  resolveToolChoice,
  convertMessages,
} from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult } from '../types.js';

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  if (!isProviderConfigured('greenpt')) {
    throw new Error(
      'GreenPT provider is not configured. Check GREENPT_API_KEY environment variable.'
    );
  }

  const model = options.model || env.GREENPT_DEFAULT_MODEL || 'mistral-medium-3.5-128b';

  const { system, messages: modelMessages } = await convertMessages(messages, systemPrompt);

  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    'greenpt',
    requestId,
    type
  );
  const tools = buildAiSdkTools(toolsPayload);

  const toolChoice = tools ? resolveToolChoice(toolsPayload.tool_choice) : undefined;

  const aiModel = getModel('greenpt', model);

  try {
    const result = await generateText({
      model: aiModel,
      ...(system != null && { system }),
      messages: modelMessages,
      ...(options.max_tokens != null && { maxOutputTokens: options.max_tokens }),
      // `??`, not `||`: 0 is a value a caller means, not a missing one.
      temperature: options.temperature ?? 0,
      topP: options.top_p ?? 0.1,
      ...(tools != null && { tools }),
      ...(toolChoice != null && { toolChoice }),
    });

    return buildAdapterResult({
      provider: 'greenpt',
      model,
      requestId,
      type,
      requestMetadata,
      result,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`[greenptAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
