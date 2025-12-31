const { getIonosClient } = require('../clients/ionosClient');
const { mergeMetadata } = require('./adapterUtils');
const ToolHandler = require('../../services/toolHandler');

async function execute(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  // IONOS supports GPT-OSS and Llama via OpenAI-compatible API
  let model = options.model || 'openai/gpt-oss-120b';
  const modelStr = String(model).toLowerCase();
  const looksIncompatible = /mistral|mixtral|gpt-4|claude|anthropic|bedrock/.test(modelStr);
  if (looksIncompatible) {
    model = 'openai/gpt-oss-120b';
  }

  const client = getIonosClient();

  const ionosMessages = [];
  if (systemPrompt) ionosMessages.push({ role: 'system', content: systemPrompt });
  if (messages) {
    messages.forEach(msg => {
      ionosMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  const ionosConfig = {
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

  return {
    content: responseContent,
    stop_reason: stopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks: [{ type: 'text', text: responseContent }],
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

module.exports = { execute };
