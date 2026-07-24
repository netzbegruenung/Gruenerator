/**
 * Regolo AI Adapter
 * Uses Vercel AI SDK for text generation via OpenAI-compatible API (api.regolo.ai)
 */

import { generateText } from 'ai';

import { env } from '../../config/env.js';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import { buildAiSdkTools, convertMessagesWithImages, mergeMetadata } from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  if (!isProviderConfigured('regolo')) {
    throw new Error(
      'Regolo provider is not configured. Check REGOLO_API_KEY environment variable.'
    );
  }

  const model = options.model || env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';

  const { system, messages: modelMessages } = convertMessagesWithImages(messages, systemPrompt);

  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    'regolo',
    requestId,
    type
  );
  const tools = buildAiSdkTools(toolsPayload);

  let toolChoice: 'auto' | 'none' | 'required' | undefined;
  if (tools) {
    const choice = toolsPayload.tool_choice as string | { type: string; name?: string } | undefined;
    if (choice === 'required') {
      toolChoice = 'required';
    } else if (choice === undefined || choice === 'none') {
      toolChoice = 'none';
    } else {
      toolChoice = 'auto';
    }
  }

  const aiModel = getModel('regolo', model);

  try {
    const result = await generateText({
      model: aiModel,
      ...(system != null && { system }),
      messages: modelMessages,
      maxOutputTokens: options.max_tokens || 4096,
      temperature: options.temperature || 0,
      topP: options.top_p || 0.1,
      ...(tools != null && { tools }),
      ...(toolChoice != null && { toolChoice }),
    });

    const textContent = result.text || null;

    const toolCalls: ToolCall[] | undefined =
      result.toolCalls && result.toolCalls.length > 0
        ? result.toolCalls.map((tc, index) => ({
            id: tc.toolCallId || `regolo_tool_${index}`,
            name: tc.toolName,
            input: tc.input as Record<string, unknown>,
          }))
        : undefined;

    const rawContentBlocks: ContentBlock[] = [];
    if (textContent) {
      rawContentBlocks.push({ type: 'text', text: textContent });
    }
    if (toolCalls) {
      for (const tc of toolCalls) {
        rawContentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
    }

    const stopReason =
      result.finishReason === 'tool-calls' ? 'tool_use' : result.finishReason || 'stop';

    return {
      content: textContent,
      stop_reason: stopReason,
      tool_calls: toolCalls,
      raw_content_blocks:
        rawContentBlocks.length > 0
          ? rawContentBlocks
          : [{ type: 'text', text: textContent || '' }],
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'regolo',
        model: model,
        timestamp: new Date().toISOString(),
        requestId,
        ...(result.usage && {
          usage: {
            prompt_tokens: result.usage.inputTokens,
            completion_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
          },
        }),
      }),
    };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`[regoloAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
