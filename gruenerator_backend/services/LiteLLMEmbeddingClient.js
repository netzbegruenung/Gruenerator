import axios from 'axios';

// Minimal client to fetch embeddings from LiteLLM (OpenAI-compatible) or Ollama
// Defaults point to an Ollama host exposing nomic-embed-text:latest

export default class LiteLLMEmbeddingClient {
  constructor({ baseUrl = 'http://10.137.1.2:11434', model = 'nomic-embed-text:latest', timeout = 30000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeout = timeout;
    this.http = axios.create({ timeout: this.timeout });
  }

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') throw new Error('Text required');

    // Try OpenAI-compatible first (LiteLLM /v1/embeddings)
    try {
      const res = await this.http.post(`${this.baseUrl}/v1/embeddings`, {
        model: this.model,
        input: text,
      });
      const vec = res.data?.data?.[0]?.embedding;
      if (Array.isArray(vec)) return vec;
    } catch (_) {}

    // Fallback to Ollama native embeddings API
    const res2 = await this.http.post(`${this.baseUrl}/api/embeddings`, {
      model: this.model,
      prompt: text,
    });
    const vec2 = res2.data?.embedding;
    if (!Array.isArray(vec2)) throw new Error('No embedding returned');
    return vec2;
  }

  async generateBatchEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) throw new Error('Texts must be non-empty array');
    // Simple sequential batching to keep it robust
    const out = [];
    for (const t of texts) {
      // Small retry loop
      let lastErr;
      for (let a = 0; a < 2; a++) {
        try {
          out.push(await this.generateEmbedding(t));
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise(r => setTimeout(r, 500 * (a + 1)));
        }
      }
      if (lastErr) throw lastErr;
    }
    return out;
  }
}
