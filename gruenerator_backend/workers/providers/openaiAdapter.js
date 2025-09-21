const { getOpenAIClient } = require('../clients/openaiClient');
const { mergeMetadata } = require('./adapterUtils');

async function execute(requestId, data) {
  const { systemPrompt, messages, type, metadata: requestMetadata = {} } = data;

  const client = getOpenAIClient();

  const openAIMessages = [];

  if (type === 'social') {
    if (systemPrompt) {
      openAIMessages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    if (messages) {
      messages.forEach(msg => {
        openAIMessages.push({
          role: msg.role,
          content: Array.isArray(msg.content)
            ? msg.content.map(c => c.text).join('\n')
            : msg.content
        });
      });
    }
  } else {
    if (systemPrompt) openAIMessages.push({ role: 'system', content: systemPrompt });
    if (messages) {
      messages.forEach(msg => {
        openAIMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      });
    }
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: openAIMessages,
    temperature: 0.7,
    max_tokens: 4000,
    response_format: (type === 'social' || type === 'generator_config') ? { type: 'json_object' } : undefined
  });

  const choice = response.choices && response.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error(`Invalid OpenAI response for request ${requestId}`);
  }

  return {
    content: choice.message.content,
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'openai',
      timestamp: new Date().toISOString(),
      backupRequested: true,
      type,
      requestId
    })
  };
}

module.exports = { execute };

