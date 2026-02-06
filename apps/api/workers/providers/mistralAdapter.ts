/**
 * Mistral AI Adapter
 * Uses Vercel AI SDK for text generation with content-type specific configurations
 */

import { generateText, type CoreMessage, type CoreTool } from 'ai';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import {
  getGenerationConfig,
  applyProModeConfig,
  type GenerationOptions,
} from '../../services/ai/config.js';
import ToolHandler from '../../services/tools/index.js';
import { mergeMetadata } from './adapterUtils.js';

import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

// Connection metrics for monitoring
export interface ConnectionMetrics {
  attempts: number;
  successes: number;
  failures: number;
  retries: number;
  lastFailureTime: number | null;
  lastFailureReason: string | null;
}

export const connectionMetrics: ConnectionMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  lastFailureTime: null,
  lastFailureReason: null,
};

/**
 * Convert internal message format to Vercel AI SDK CoreMessage format
 */
async function convertMessages(
  messages: AIRequestData['messages'],
  systemPrompt?: string
): Promise<CoreMessage[]> {
  const coreMessages: CoreMessage[] = [];

  // Add system message if provided
  if (systemPrompt) {
    coreMessages.push({ role: 'system', content: systemPrompt });
  }

  if (!messages) return coreMessages;

  for (const msg of messages) {
    // Skip system messages if we already added one
    if (msg.role === 'system' && systemPrompt) {
      continue;
    }

    // Handle assistant messages with tool calls
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const content = msg.content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: unknown;
        text?: string;
      }>;

      const toolUseBlocks = content.filter((c) => c.type === 'tool_use');
      const textContent = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('\n');

      if (toolUseBlocks.length > 0) {
        // Assistant message with tool calls
        coreMessages.push({
          role: 'assistant',
          content: [
            ...(textContent ? [{ type: 'text' as const, text: textContent }] : []),
            ...toolUseBlocks.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.id || '',
              toolName: tc.name || '',
              args: tc.input as Record<string, unknown>,
            })),
          ],
        });
      } else if (textContent) {
        coreMessages.push({ role: 'assistant', content: textContent });
      }
      continue;
    }

    // Handle user messages with tool results
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const content = msg.content as Array<{
        type: string;
        tool_use_id?: string;
        tool_call_id?: string;
        toolCallId?: string;
        id?: string;
        content?: unknown;
        text?: string;
        source?: {
          data?: string;
          media_type?: string;
          name?: string;
          url?: string;
          text?: string;
        };
      }>;

      const toolResults = content.filter((c) => c.type === 'tool_result');
      if (toolResults.length > 0) {
        // Tool result messages
        for (const tr of toolResults) {
          const resultContent =
            typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
          const toolCallId = tr.tool_use_id || tr.tool_call_id || tr.toolCallId || tr.id || '';
          coreMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId,
                toolName: '', // Will be matched by toolCallId
                result: resultContent,
              },
            ],
          });
        }
        continue;
      }

      // Handle documents and images
      const hasImages = content.some((c) => c.type === 'image' && c.source?.data);
      if (hasImages) {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];
        for (const c of content) {
          if (c.type === 'text') {
            parts.push({ type: 'text', text: c.text || '' });
          } else if (c.type === 'image' && c.source?.data) {
            const mediaType = c.source.media_type || 'image/png';
            const base64Data = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
            parts.push({ type: 'image', image: `data:${mediaType};base64,${base64Data}` });
          }
        }
        coreMessages.push({ role: 'user', content: parts });
        continue;
      }

      // Text-only user message with documents
      const textParts = await Promise.all(
        content.map(async (c) => {
          if (c.type === 'text') {
            return c.text || '';
          } else if (c.type === 'document' && c.source) {
            if (c.source.data && c.source.media_type === 'application/pdf') {
              try {
                const { ocrService } = await import('../../services/ocrService.js');
                const result = await ocrService.extractTextFromBase64PDF(
                  c.source.data,
                  c.source.name || 'unknown.pdf'
                );
                return `[PDF-Inhalt: ${c.source.name || 'Unbekannt'}]\n\n${result.text}`;
              } catch (error: unknown) {
                const err = error as { message?: string };
                return `[PDF-Dokument: ${c.source.name || 'Unbekannt'} - Text-Extraktion fehlgeschlagen: ${err.message || 'Unknown error'}]`;
              }
            } else if (c.source.text) {
              return c.source.text;
            }
            return `[Dokument: ${c.source.name || 'Unbekannt'}]`;
          }
          return '';
        })
      );
      coreMessages.push({ role: 'user', content: textParts.filter(Boolean).join('\n') });
      continue;
    }

    // Simple text message
    coreMessages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
    });
  }

  return coreMessages;
}

/**
 * Convert tool handler payload to Vercel AI SDK tools format
 */
function convertTools(
  toolsPayload: ReturnType<typeof ToolHandler.prepareToolsPayload>
): Record<string, CoreTool> | undefined {
  if (!toolsPayload.tools || toolsPayload.tools.length === 0) {
    return undefined;
  }

  const tools: Record<string, CoreTool> = {};
  for (const tool of toolsPayload.tools as Array<{
    name: string;
    description: string;
    parameters?: unknown;
    input_schema?: unknown;
  }>) {
    tools[tool.name] = {
      description: tool.description,
      parameters: (tool.parameters || tool.input_schema) as CoreTool['parameters'],
    };
  }
  return tools;
}

/**
 * Execute a Mistral AI request using Vercel AI SDK
 */
async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  // Check provider availability
  if (!isProviderConfigured('mistral')) {
    throw new Error('Mistral provider is not configured. Check MISTRAL_API_KEY environment variable.');
  }

  const model = options.model || 'mistral-large-2512';
  const platforms = (requestMetadata as { platforms?: string[] }).platforms;

  // Get content-type specific configuration
  const generationOptions: GenerationOptions = {
    type,
    systemPrompt,
    platforms,
    temperature: options.temperature,
    maxTokens: options.max_tokens,
    topP: options.top_p,
    useProMode: options.useProMode,
  };

  let config = getGenerationConfig(generationOptions);

  // Apply Pro Mode adjustments for reasoning models
  if (options.useProMode) {
    config = applyProModeConfig(config, model);
  }

  // Convert messages to Vercel AI SDK format
  const coreMessages = await convertMessages(messages, systemPrompt);

  // Prepare tools
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'mistral', requestId, type);
  const tools = convertTools(toolsPayload);

  // Determine tool choice
  let toolChoice: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string } | undefined;
  if (tools) {
    if (toolsPayload.tool_choice === 'required' || toolsPayload.tool_choice === 'any') {
      toolChoice = 'required';
    } else if (toolsPayload.tool_choice === 'none') {
      toolChoice = 'none';
    } else if (
      typeof toolsPayload.tool_choice === 'object' &&
      toolsPayload.tool_choice?.type === 'tool'
    ) {
      toolChoice = {
        type: 'tool',
        toolName: (toolsPayload.tool_choice as { name?: string }).name || '',
      };
    } else {
      toolChoice = 'auto';
    }
  }

  // Get the model instance
  const aiModel = getModel('mistral', model);

  // Retry logic with exponential backoff
  let lastError: Error | undefined;
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        connectionMetrics.retries++;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `[mistralAdapter ${requestId}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      connectionMetrics.attempts++;

      const result = await generateText({
        model: aiModel,
        messages: coreMessages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        topP: config.topP,
        tools,
        toolChoice,
        // Response format for specific types
        ...(type === 'image_picker' || type === 'text_adjustment'
          ? {
              experimental_output: undefined, // JSON mode handled by Mistral model
            }
          : {}),
      });

      connectionMetrics.successes++;

      if (attempt > 1) {
        console.log(`[mistralAdapter ${requestId}] Retry successful on attempt ${attempt}`);
      }

      // Extract text content
      const textContent = result.text || null;

      // Extract tool calls
      const toolCalls: ToolCall[] | undefined =
        result.toolCalls && result.toolCalls.length > 0
          ? result.toolCalls.map((tc, index) => ({
              id: tc.toolCallId || `mistral_tool_${index}`,
              name: tc.toolName,
              input: tc.args as Record<string, unknown>,
            }))
          : undefined;

      // Build raw content blocks
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

      // Normalize finish reason
      const stopReason =
        result.finishReason === 'tool-calls' ? 'tool_use' : result.finishReason || 'stop';

      return {
        content: textContent,
        stop_reason: stopReason,
        tool_calls: toolCalls,
        raw_content_blocks: rawContentBlocks.length > 0 ? rawContentBlocks : undefined,
        success: true,
        metadata: mergeMetadata(requestMetadata, {
          provider: 'mistral',
          model: model,
          timestamp: new Date().toISOString(),
          requestId,
          usage: result.usage
            ? {
                prompt_tokens: result.usage.promptTokens,
                completion_tokens: result.usage.completionTokens,
                total_tokens: result.usage.totalTokens,
              }
            : undefined,
        }),
      };
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; cause?: { code?: string } };
      lastError = error as Error;
      connectionMetrics.failures++;
      connectionMetrics.lastFailureTime = Date.now();
      connectionMetrics.lastFailureReason = err.message || 'Unknown error';

      // Check if error is retryable
      const isRetryable =
        err.message?.includes('fetch failed') ||
        err.message?.includes('socket') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('UND_ERR_SOCKET') ||
        err.cause?.code === 'UND_ERR_SOCKET' ||
        err.message?.includes('rate limit') ||
        err.message?.includes('timeout');

      if (!isRetryable || attempt === maxRetries) {
        console.error(
          `[mistralAdapter ${requestId}] ${isRetryable ? 'Max retries reached' : 'Non-retryable error'}:`,
          {
            message: err.message,
            code: err.code || err.cause?.code,
            attempt: attempt,
          }
        );
        throw error;
      }

      console.warn(
        `[mistralAdapter ${requestId}] Retryable connection error on attempt ${attempt}:`,
        err.message
      );
    }
  }

  throw lastError || new Error('No response received from Mistral');
}

export { execute };
