/**
 * LiteLLM AI Adapter
 * Uses Vercel AI SDK for text generation via OpenAI-compatible API
 */

import { generateText, type ModelMessage, type Tool } from 'ai';
import { getModel, isProviderConfigured } from '../../services/ai/providers.js';
import ToolHandler from '../../services/tools/index.js';
import { mergeMetadata } from './adapterUtils.js';
import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

/**
 * Convert internal message format to Vercel AI SDK ModelMessage format
 */
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

    // Handle array content (flatten to string for LiteLLM)
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

/**
 * Convert tool handler payload to Vercel AI SDK tools format
 */
function convertTools(
  toolsPayload: ReturnType<typeof ToolHandler.prepareToolsPayload>
): Record<string, Tool> | undefined {
  if (!toolsPayload.tools || toolsPayload.tools.length === 0) {
    return undefined;
  }

  const tools: Record<string, Tool> = {};
  for (const tool of toolsPayload.tools as Array<{
    name: string;
    description: string;
    parameters?: unknown;
    input_schema?: unknown;
  }>) {
    tools[tool.name] = {
      description: tool.description,
      inputSchema: (tool.parameters || tool.input_schema) as Tool['inputSchema'],
    };
  }
  return tools;
}

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

  // Default to LiteLLM-compatible model
  let model = options.model || 'gpt-oss:120b';

  // Validate model compatibility
  const modelStr = String(model).toLowerCase();
  const looksIncompatible = /mistral|mixtral|gpt-4|gpt-3|claude|anthropic|bedrock|openai/.test(
    modelStr
  );
  if (looksIncompatible && !modelStr.includes('gpt-oss')) {
    console.warn(
      `[litellmAdapter ${requestId}] Model "${model}" is incompatible with LiteLLM. Using default.`
    );
    model = 'gpt-oss:120b';
  }

  // Convert messages to Vercel AI SDK format
  const modelMessages = convertMessages(messages, systemPrompt);

  // Prepare tools
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'litellm', requestId, type);
  const tools = convertTools(toolsPayload);

  // Determine tool choice
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

  // Get the model instance
  const aiModel = getModel('litellm', model);

  try {
    const result = await generateText({
      model: aiModel,
      messages: modelMessages,
      maxOutputTokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      topP: options.top_p || 1.0,
      tools,
      toolChoice,
    });

    // Extract text content
    const textContent = result.text || null;

    // Extract tool calls
    const toolCalls: ToolCall[] | undefined =
      result.toolCalls && result.toolCalls.length > 0
        ? result.toolCalls.map((tc, index) => ({
            id: tc.toolCallId || `litellm_tool_${index}`,
            name: tc.toolName,
            input: tc.input as Record<string, unknown>,
          }))
        : undefined;

    // Validate response
    const isToolUseResponse =
      result.finishReason === 'tool-calls' || (toolCalls && toolCalls.length > 0);
    if (!textContent && !isToolUseResponse) {
      const errorMsg = `Empty response from LiteLLM model=${model}`;
      console.error(`[litellmAdapter ${requestId}] ${errorMsg}`);
      throw new Error(errorMsg);
    }

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
      raw_content_blocks:
        rawContentBlocks.length > 0 ? rawContentBlocks : [{ type: 'text', text: textContent || '' }],
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'litellm',
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
    console.error(`[litellmAdapter ${requestId}] Error:`, err.message);
    throw error;
  }
}

export { execute };
