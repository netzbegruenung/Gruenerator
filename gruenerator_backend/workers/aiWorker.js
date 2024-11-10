const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

async function processAIRequest(data) {
  const { type, prompt, options = {}, systemPrompt, messages } = data;
  
  try {
    // Standardkonfiguration
    const defaultConfig = {
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.3
    };

    // Spezifische Konfiguration je nach Anfragentyp
    let requestConfig = {
      ...defaultConfig,
      ...options,
      system: systemPrompt
    };

    // Behandle verschiedene Nachrichtenformate
    if (messages) {
      // Für PDF und komplexe Nachrichten
      requestConfig.messages = messages;
    } else if (prompt) {
      // Für einfache Text-Prompts
      requestConfig.messages = [{
        role: "user",
        content: prompt
      }];
    }

    // Füge Beta-Features für PDF-Verarbeitung hinzu, wenn nötig
    if (type === 'antragsversteher' && options.betas) {
      requestConfig.betas = options.betas;
    }

    const response = await anthropic.messages.create(requestConfig);

    // Verarbeite die Antwort basierend auf dem Antworttyp
    if (response && response.content && Array.isArray(response.content)) {
      // Für normale Textantworten und PDF-Analysen
      const textContent = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');
      
      return {
        success: true,
        result: textContent
      };
    }

    throw new Error('Ungültiges Antwortformat von der API');
  } catch (error) {
    console.error(`AI Worker Error (${type}):`, error.message);
    throw error;
  }
}

parentPort.on('message', async (data) => {
  try {
    const result = await processAIRequest(data);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
});