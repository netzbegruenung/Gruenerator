const OpenAI = require('openai');

function getIonosClient() {
  const apiKey = process.env.IONOS_API_TOKEN;
  if (!apiKey) {
    throw new Error('IONOS_API_TOKEN environment variable is required for IONOS requests');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://openai.inference.de-txl.ionos.com/v1'
  });
}

module.exports = { getIonosClient };

