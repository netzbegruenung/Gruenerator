import { config } from '../config.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/embeddings';

export async function generateEmbedding(text) {
  if (!config.mistral?.apiKey) {
    throw new Error('MISTRAL_API_KEY nicht konfiguriert');
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mistral.apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: [text]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API Fehler: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data.data || !data.data[0] || !data.data[0].embedding) {
    throw new Error('Keine Embedding in Antwort');
  }

  console.error(`[Embeddings] Mistral Embedding generiert (${data.data[0].embedding.length} Dimensionen)`);
  return data.data[0].embedding;
}

export async function generateEmbeddings(texts) {
  if (!config.mistral?.apiKey) {
    throw new Error('MISTRAL_API_KEY nicht konfiguriert');
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mistral.apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API Fehler: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data.map(d => d.embedding);
}
