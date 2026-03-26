/**
 * Regolo AI Adapter
 * Uses Vercel AI SDK for text generation via OpenAI-compatible API (api.regolo.ai)
 */

import { generateText, type ModelMessage, type Tool } from 'ai';

import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';

import { mergeMetadata } from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

function convertMessages(
  messages: AIRequestData['messages'],
  systemPrompt?: string
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (systemPrompt) {
    modelMessages.push({ role: 'system', content: systemPrompt });
  }

  if (!messages) return modelMessages;

  for (const msg of messages) {
    if (msg.role === 'system' && systemPrompt) {
      continue;
    }

    let content: string;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((c) => {
          const block = c as { text?: string; content?: string };
          return block.text || block.content || '';
        })
        .join('\n');
    } else {
      content = String(msg.content);
    }

    modelMessages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content,
    });
  }

  return modelMessages;
}

function convertTools(
  toolsPayload: ReturnType<typeof ToolHandler.prepareToolsPayload>
): Record<string, Tool> | undefined {
  if (!toolsPayload.tools || toolsPayload.tools.length === 0) {
    return undefined;
  }

  const tools: Record<string, Tool> = {};
  for (const t of toolsPayload.tools as Array<{
    name: string;
    description: string;
    parameters?: unknown;
    input_schema?: unknown;
  }>) {
    tools[t.name] = {
      description: t.description,
      inputSchema: (t.parameters || t.input_schema) as Tool['inputSchema'],
    };
  }
  return tools;
}

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  if (!isProviderConfigured('regolo')) {
    throw new Error(
      'Regolo provider is not configured. Check REGOLO_API_KEY environment variable.'
    );
  }

  const model = options.model || process.env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';

  const modelMessages = convertMessages(messages, systemPrompt);

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'regolo', requestId, type);
  const tools = convertTools(toolsPayload);

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
      messages: modelMessages,
      maxOutputTokens: options.max_tokens || 4096,
      temperature: options.temperature || 0,
      topP: options.top_p || 0.1,
      tools,
      toolChoice,
    });

    const textContent = result.text || null;

    const toolCalls: ToolCall[] | undefined =
      result.toolCalls && result.toolCalls.length > 0
        ? result.toolCalls.map((tc, index) => ({
            id: tc.toolCallId || `regolo_tool_${index}`,
            name: tc.toolName,
            input: (tc as any).input as Record<string, unknown>,
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
        usage: result.usage
          ? {
              prompt_tokens: result.usage.inputTokens,
              completion_tokens: result.usage.outputTokens,
              total_tokens: result.usage.totalTokens,
            }
          : undefined,
      }),
    };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`[regoloAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
