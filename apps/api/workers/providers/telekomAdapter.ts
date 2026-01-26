import { getTelekomClient } from '../clients/telekomClient.js';
import { mergeMetadata } from './adapterUtils.js';
import ToolHandler from '../../services/tools/index.js';
import type { AIRequestData, AIWorkerResult, Message, ToolCall } from '../types.js';
import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  // Default to Llama-3.1-70B-Instruct for Anthropic-like quality
  let model = options.model || 'Llama-3.1-70B-Instruct';
  const modelStr = String(model).toLowerCase();

  // Ensure we're using a Telekom-compatible model
  const telekomModels = ['llama-3.1-70b-instruct', 'llama-3.1-8b-instruct', 'mistral-large'];
  if (!telekomModels.some((m) => modelStr.includes(m.toLowerCase()))) {
    model = 'Llama-3.1-70B-Instruct';
  }

  const client = getTelekomClient();

  const telekomMessages: ChatCompletionMessageParam[] = [];
  if (systemPrompt) telekomMessages.push({ role: 'system', content: systemPrompt });
  if (messages) {
    messages.forEach((msg: Message) => {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map(
                  (c) =>
                    (c as { text?: string; content?: string }).text ||
                    (c as { text?: string; content?: string }).content ||
                    ''
                )
                .join('\n')
            : String(msg.content);

      telekomMessages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
      });
    });
  }

  const telekomConfig: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: telekomMessages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature !== undefined ? options.temperature : 0.5,
    stream: false as const,
  };

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'telekom', requestId, type);
  if (toolsPayload.tools) {
    telekomConfig.tools = toolsPayload.tools as any; // ToolHandler returns OpenAI format for 'telekom' provider
    if (toolsPayload.tool_choice) telekomConfig.tool_choice = toolsPayload.tool_choice as any;
  }

  const response = await client.chat.completions.create(telekomConfig);
  const choice = response.choices && response.choices[0];
  const responseContent = choice?.message?.content || null;
  const toolCalls = choice?.message?.tool_calls || [];
  const stopReason = choice?.finish_reason || 'stop';

  const normalizedToolCalls: ToolCall[] | undefined =
    toolCalls.length > 0
      ? toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.type === 'function' ? tc.function.name : tc.id,
          input: tc.type === 'function' ? JSON.parse(tc.function.arguments || '{}') : {},
        }))
      : undefined;

  return {
    content: responseContent,
    stop_reason: stopReason,
    tool_calls: normalizedToolCalls,
    raw_content_blocks: [{ type: 'text', text: responseContent || '' }],
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'telekom',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage,
    }),
  };
}

export { execute };
