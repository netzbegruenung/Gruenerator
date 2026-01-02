import { getIonosClient } from '../clients/ionosClient.js';
import { mergeMetadata } from './adapterUtils.js';
import ToolHandler from '../../services/tools/index.js';
import type { AIRequestData, AIWorkerResult, Message, ToolCall } from '../types.js';

interface IonosMessage {
  role: string;
  content: string;
}

interface IonosConfig {
  model: string;
  messages: IonosMessage[];
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

  let model = options.model || 'openai/gpt-oss-120b';
  const modelStr = String(model).toLowerCase();
  const looksIncompatible = /mistral|mixtral|gpt-4|claude|anthropic|bedrock/.test(modelStr);
  if (looksIncompatible) {
    model = 'openai/gpt-oss-120b';
  }

  const client = getIonosClient();

  const ionosMessages: IonosMessage[] = [];
  if (systemPrompt) ionosMessages.push({ role: 'system', content: systemPrompt });
  if (messages) {
    messages.forEach((msg: Message) => {
      ionosMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => (c as { text?: string; content?: string }).text || (c as { text?: string; content?: string }).content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  const ionosConfig: IonosConfig = {
    model,
    messages: ionosMessages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature || 0,
    top_p: options.top_p || 0.1,
    stream: false
  };

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'ionos', requestId, type);
  if (toolsPayload.tools) {
    ionosConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) ionosConfig.tool_choice = toolsPayload.tool_choice;
  }

  const response = await client.chat.completions.create(ionosConfig);
  const choice = response.choices && response.choices[0];
  const responseContent = choice?.message?.content || null;
  const toolCalls = choice?.message?.tool_calls || [];
  const stopReason = choice?.finish_reason || 'stop';

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
      provider: 'ionos',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage
    })
  };
}

export { execute };
