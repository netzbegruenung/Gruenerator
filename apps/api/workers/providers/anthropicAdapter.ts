import { Anthropic } from '@anthropic-ai/sdk';
import ToolHandler from '../../services/tools/index.js';
import config from '../worker.config.js';
import { mergeMetadata } from './adapterUtils.js';
import * as typeProfiles from '../../config/typeProfiles.js';
import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface AnthropicRequestConfig {
  model: string;
  max_tokens: number;
  temperature: number;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  tools?: unknown[];
  tool_choice?: unknown;
}

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { prompt, systemPrompt, messages, options = {}, type, metadata: requestMetadata = {}, fileMetadata } = data;

  const { useBedrock, betas, ...apiOptions } = options as { useBedrock?: boolean; betas?: string[]; [key: string]: unknown };

  const defaultConfig: AnthropicRequestConfig = {
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 8000,
    temperature: 0.7
  };

  const typeConfig = typeProfiles.getTypeProfile(type) as Partial<AnthropicRequestConfig> | null;

  const requestConfig: AnthropicRequestConfig = {
    ...defaultConfig,
    ...(typeConfig || {}),
    ...(apiOptions as Partial<AnthropicRequestConfig>),
    system: systemPrompt || typeConfig?.system || undefined
  };

  const headers: Record<string, string> = {};

  if (messages) {
    requestConfig.messages = messages as Array<{ role: string; content: string }>;
  } else if (prompt) {
    requestConfig.messages = [{ role: 'user', content: prompt }];
  }

  const toolsPayload = ToolHandler.prepareToolsPayload(apiOptions, 'claude', requestId, type);
  if (toolsPayload.tools) {
    requestConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) requestConfig.tool_choice = toolsPayload.tool_choice;
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Request Timeout nach ${config.worker.requestTimeout / 1000} Sekunden`)), config.worker.requestTimeout);
  });

  const response = await Promise.race([
    anthropic.messages.create(requestConfig as Parameters<typeof anthropic.messages.create>[0], { headers }),
    timeoutPromise
  ]) as Anthropic.Message;

  if (!response.content || !response.content[0] || !(response.content[0] as { text?: string }).text) {
    if (response.stop_reason !== 'tool_use' && (!response.content || !response.content[0] || typeof (response.content[0] as { text?: string }).text !== 'string')) {
      throw new Error(`Invalid Claude response for request ${requestId}: missing textual content when not using tools`);
    }
    if (response.stop_reason === 'tool_use' && (!(response as unknown as { tool_calls?: unknown[] }).tool_calls || (response as unknown as { tool_calls?: unknown[] }).tool_calls!.length === 0)) {
      throw new Error(`Invalid Claude response for request ${requestId}: tool_use indicated but no tool_calls provided.`);
    }
  }

  const textualContent = response.content?.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text || null;

  const toolCalls: ToolCall[] | undefined = response.content
    ?.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>
    }));

  const rawContentBlocks: ContentBlock[] = response.content?.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    } else if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> };
    }
    return { type: block.type };
  }) || [];

  return {
    content: textualContent,
    stop_reason: response.stop_reason,
    tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks: rawContentBlocks,
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'claude',
      timestamp: new Date().toISOString(),
      backupRequested: false,
      requestId,
      messageId: response.id,
      isFilesApiRequest: fileMetadata?.fileId ? true : false,
      fileId: fileMetadata?.fileId || null,
      usedPromptCaching: fileMetadata?.usePromptCaching || false,
      modelUsed: requestConfig.model
    })
  };
}

export { execute };
