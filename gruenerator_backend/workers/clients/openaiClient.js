const OpenAI = require('openai');

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  return new OpenAI({ apiKey });
}

module.exports = { getOpenAIClient };

