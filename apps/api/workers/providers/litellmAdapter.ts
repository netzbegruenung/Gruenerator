import { getLiteLlmClient } from '../clients/liteLlmClient.js';
import { mergeMetadata } from './adapterUtils.js';
import ToolHandler from '../../services/tools/index.js';
import type { AIRequestData, AIWorkerResult, Message, ToolCall } from '../types.js';

interface LitellmMessage {
  role: string;
  content: string;
}

interface LitellmConfig {
  model: string;
  messages: LitellmMessage[];
  max_tokens: number;
  temperature: number;
  top_p: number;
  stream: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  let model = options.model || 'gpt-oss:120b';
  const modelStr = String(model).toLowerCase();
  const looksIncompatible = /mistral|mixtral|gpt-4|gpt-3|claude|anthropic|bedrock|openai/.test(modelStr);
  if (looksIncompatible && !modelStr.includes('gpt-oss')) {
    model = 'gpt-oss:120b';
  }

  const client = getLiteLlmClient();

  const litellmMessages: LitellmMessage[] = [];
  if (systemPrompt) litellmMessages.push({ role: 'system', content: systemPrompt });
  if (messages) {
    messages.forEach((msg: Message) => {
      litellmMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => (c as { text?: string; content?: string }).text || (c as { text?: string; content?: string }).content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  const litellmConfig: LitellmConfig = {
    model,
    messages: litellmMessages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 1.0,
    stream: false
  };

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'litellm', requestId, type);
  if (toolsPayload.tools) {
    litellmConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) litellmConfig.tool_choice = toolsPayload.tool_choice;
  }

  const response = await client.chat.completions.create(litellmConfig);
  const choice = response.choices?.[0];
  const responseContent = choice?.message?.content || null;
  const toolCalls = choice?.message?.tool_calls || [];
  const stopReason = choice?.finish_reason || 'stop';

  const isToolUseResponse = stopReason === 'tool_use' || (toolCalls && toolCalls.length > 0);
  if (!responseContent && !isToolUseResponse) {
    const errorMsg = `Empty response from LiteLLM model=${response.model || model}`;
    console.error(`[LiteLLM ${requestId}] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const normalizedToolCalls: ToolCall[] | undefined = toolCalls.length > 0
    ? toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}')
      }))
    : undefined;

  return {
    content: responseContent,
    stop_reason: stopReason,
    tool_calls: normalizedToolCalls,
    raw_content_blocks: [{ type: 'text', text: responseContent || '' }],
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'litellm',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage
    })
  };
}

export { execute };
