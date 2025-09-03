import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mistralClient = require('../workers/mistralClient.js');

export default class MistralEmbeddingClient {
  constructor({ model = 'mistral-embed' } = {}) {
    this.model = model;
  }

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') throw new Error('Text required');
    const resp = await mistralClient.embeddings.create({
      model: this.model,
      inputs: [text],
    });
    const vec = resp?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error('No embedding returned');
    return vec;
  }

  async generateBatchEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) throw new Error('Texts must be non-empty array');
    const resp = await mistralClient.embeddings.create({
      model: this.model,
      inputs: texts,
    });
    const arr = resp?.data;
    if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('Embedding batch size mismatch');
    return arr.map(d => d.embedding);
  }
}

