const Anthrop = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthrop({
  apiKey: process.env.CLAUDE_API_KEY
});

function formatQuoteContent(quote, name) {
  return `Zitat: ${quote}\nName: ${name}`;
}

function formatThreeColumnsContent(line1, line2, line3) {
  return `Zeile 1: ${line1}\nZeile 2: ${line2}\nZeile 3: ${line3}`;
}

async function sendToClaudeAPI(content) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.9,
      system: `Du bist Social-Media-Manager von Bündnis 90/Die Grünen. Mache einen Vorschlag für einen Social-Media Post inkl. Beitragstext und Bildidee und eine social-media-aktion. Der User gibt dir Thema und Details. Gib nur den Inhalt wieder.`,
      messages: [
        {
          role: "user",
          content: content
        }
      ]
    });
    return response;
  } catch (error) {
    throw new Error(`Claude API Error: ${error.message}`);
  }
}

function handleClaudeApiError(error) {
  console.error('Error with Claude API:', error.response ? error.response.data : error.message);
}

module.exports = {
  formatQuoteContent,
  formatThreeColumnsContent,
  sendToClaudeAPI,
  handleClaudeApiError
};
