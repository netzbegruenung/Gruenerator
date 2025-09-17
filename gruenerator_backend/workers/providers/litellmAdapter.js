const { getLiteLlmClient } = require('../clients/liteLlmClient');
const { mergeMetadata } = require('./adapterUtils');
const ToolHandler = require('../../services/toolHandler');

async function execute(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  // Pick a sensible default for LiteLLM if caller supplied a model from another family
  let model = options.model || 'llama3.3';
  const modelStr = String(model).toLowerCase();
  const looksIncompatible = /mistral|mixtral|gpt-|claude|anthropic|bedrock|openai/.test(modelStr);
  if (looksIncompatible || !/llama/.test(modelStr)) {
    model = 'llama3.3';
  }

  const client = getLiteLlmClient();

  const litellmMessages = [];
  if (systemPrompt) litellmMessages.push({ role: 'system', content: systemPrompt });
  if (messages) {
    messages.forEach(msg => {
      litellmMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  const litellmConfig = {
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
      provider: 'litellm',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage
    })
  };
}

module.exports = { execute };
