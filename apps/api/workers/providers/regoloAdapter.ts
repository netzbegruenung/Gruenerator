/**
 * Regolo AI Adapter
 * Uses Vercel AI SDK for text generation via OpenAI-compatible API (api.regolo.ai)
 */

import { generateText, type ModelMessage, type Tool } from 'ai';

import { env } from '../../config/env.js';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';
import { createLogger } from '../../utils/logger.js';

import { mergeMetadata } from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

const log = createLogger('regoloAdapter');

function convertMessages(
  messages: AIRequestData['messages'],
  systemPrompt?: string
): { system: string | undefined; messages: ModelMessage[] } {
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);

  const modelMessages: ModelMessage[] = [];

  if (!messages) {
    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: modelMessages,
    };
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      const sysContent =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as Array<{ text?: string; content?: string }>)
                .map((c) => c.text || c.content || '')
                .join('\n')
            : String(msg.content);
      systemParts.push(sysContent);
      continue;
    }

    if (typeof msg.content === 'string') {
      modelMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const contentParts = msg.content as Array<{
        type: string;
        text?: string;
        content?: string;
        source?: { data?: string; media_type?: string };
        image_url?: { url: string };
      }>;

      const hasImages = contentParts.some(
        (c) =>
          (c.type === 'image' && c.source?.data) || (c.type === 'image_url' && c.image_url?.url)
      );

      if (hasImages) {
        const parts: Array<
          { type: 'text'; text: string } | { type: 'image'; image: Buffer | URL; mimeType?: string }
        > = [];

        for (const c of contentParts) {
          if (c.type === 'text') {
            parts.push({ type: 'text', text: c.text || '' });
          } else if (c.type === 'image' && c.source?.data) {
            const mediaType = c.source.media_type || 'image/png';
            const base64Data = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
            parts.push({
              type: 'image',
              image: Buffer.from(base64Data, 'base64'),
              mimeType: mediaType,
            });
          } else if (c.type === 'image_url' && c.image_url?.url) {
            const url = c.image_url.url;
            if (url.startsWith('data:')) {
              const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  type: 'image',
                  image: Buffer.from(match[2], 'base64'),
                  mimeType: match[1],
                });
              }
            } else {
              parts.push({ type: 'image', image: new URL(url) });
            }
          }
        }

        modelMessages.push({ role: 'user', content: parts });
        continue;
      }

      const textContent = contentParts.map((c) => c.text || c.content || '').join('\n');

      modelMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: textContent,
      });
      continue;
    }

    modelMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: String(msg.content),
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: modelMessages,
  };
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

  const model = options.model || env.REGOLO_DEFAULT_MODEL || 'qwen3.5-122b';

  const { system, messages: modelMessages } = convertMessages(messages, systemPrompt);

  const toolsPayload = ToolHandler.prepareToolsPayload(
    {
      ...(options.tools != null && { tools: options.tools }),
      ...(options.tool_choice != null && { tool_choice: options.tool_choice }),
    },
    'regolo',
    requestId,
    type
  );
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
    log.error(`[regoloAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
