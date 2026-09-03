import { describe, expect, it } from 'vitest';

import {
  chunkValues,
  createCandidateEmbedder,
  EMBED_BATCH_SIZE,
  formatQuery,
  type BatchEmbedResult,
  type BatchEmbedder,
} from './candidateEmbedder.js';
import { type EmbedCandidate } from './embedCandidates.js';

const withInstruction: EmbedCandidate = {
  slug: 'fake-instruct',
  provider: 'greenpt',
  model: 'fake-embedding',
  dims: 4,
  maxTokens: 512,
  queryInstruction: 'Given a German political question, retrieve passages that answer it',
};

const symmetric: EmbedCandidate = {
  ...withInstruction,
  slug: 'fake-plain',
  queryInstruction: null,
};

/** Ein Anbieter, der immer korrekt geformte Vektoren liefert und mitschreibt,
 *  was er gesehen hat. */
function fakeProvider(dims: number, tokensPerValue = 3) {
  const seen: string[][] = [];
  const embedBatch: BatchEmbedder = async (values): Promise<BatchEmbedResult> => {
    seen.push([...values]);
    return {
      embeddings: values.map(() => Array.from({ length: dims }, () => 0.1)),
      tokens: values.length * tokensPerValue,
      upstreams: values.map(() => 'scaleway'),
    };
  };
  return { seen, embedBatch };
}

describe('formatQuery', () => {
  it("uses Qwen's documented instruct form when the candidate carries one", () => {
    expect(formatQuery(withInstruction, 'Wie hoch ist der CO2-Preis?')).toBe(
      'Instruct: Given a German political question, retrieve passages that answer it\n' +
        'Query: Wie hoch ist der CO2-Preis?'
    );
  });

  it('leaves the text untouched for a symmetric candidate', () => {
    expect(formatQuery(symmetric, 'Wie hoch ist der CO2-Preis?')).toBe(
      'Wie hoch ist der CO2-Preis?'
    );
  });
});

describe('createCandidateEmbedder', () => {
  it('applies the instruction to queries only, never to documents', async () => {
    const { seen, embedBatch } = fakeProvider(4);
    const embedder = createCandidateEmbedder(withInstruction, embedBatch);

    await embedder.embedDocuments(['Dokument A', 'Dokument B']);
    await embedder.embedQuery('Anfrage');

    expect(seen[0]).toEqual(['Dokument A', 'Dokument B']);
    expect(seen[1]).toEqual([
      'Instruct: Given a German political question, retrieve passages that answer it\nQuery: Anfrage',
    ]);
  });

  it('sends documents unchanged for a symmetric candidate', async () => {
    const { seen, embedBatch } = fakeProvider(4);
    const embedder = createCandidateEmbedder(symmetric, embedBatch);
    await embedder.embedQuery('Anfrage');
    expect(seen[0]).toEqual(['Anfrage']);
  });

  it('splits into batches of 16', async () => {
    const { seen, embedBatch } = fakeProvider(4);
    const embedder = createCandidateEmbedder(symmetric, embedBatch);

    const texts = Array.from({ length: 35 }, (_, i) => `chunk ${i}`);
    const vectors = await embedder.embedDocuments(texts);

    expect(EMBED_BATCH_SIZE).toBe(16);
    expect(seen.map((s) => s.length)).toEqual([16, 16, 3]);
    expect(vectors).toHaveLength(35);
    // Reihenfolge bleibt die der Eingabe — sonst wandert jeder Vektor auf eine
    // fremde Punkt-ID.
    expect(seen.flat()).toEqual(texts);
  });

  it('embeds nothing for an empty document list', async () => {
    const { seen, embedBatch } = fakeProvider(4);
    const embedder = createCandidateEmbedder(symmetric, embedBatch);
    expect(await embedder.embedDocuments([])).toEqual([]);
    expect(seen).toHaveLength(0);
  });

  it('throws with the actual length when the provider returns other dimensions', async () => {
    const embedBatch: BatchEmbedder = async (values) => ({
      embeddings: values.map(() => Array.from({ length: 1024 }, () => 0.1)),
      tokens: 0,
      upstreams: [],
    });
    const embedder = createCandidateEmbedder(symmetric, embedBatch);
    await expect(embedder.embedDocuments(['x'])).rejects.toThrow(
      /expected 4 dimensions, got 1024 \(vector 0\)/
    );
  });

  it('throws when the provider returns fewer vectors than values', async () => {
    const embedBatch: BatchEmbedder = async () => ({
      embeddings: [[0.1, 0.2, 0.3, 0.4]],
      tokens: 0,
      upstreams: [],
    });
    const embedder = createCandidateEmbedder(symmetric, embedBatch);
    await expect(embedder.embedDocuments(['a', 'b'])).rejects.toThrow(
      /returned 1 vectors for 2 values/
    );
  });

  it('accumulates tokens, batches and Cortecs upstreams', async () => {
    const { embedBatch } = fakeProvider(4, 2);
    const embedder = createCandidateEmbedder(symmetric, embedBatch);
    await embedder.embedDocuments(Array.from({ length: 20 }, (_, i) => `c${i}`));
    expect(embedder.stats).toEqual({
      batches: 2,
      values: 20,
      tokens: 40,
      upstreams: { scaleway: 20 },
    });
  });
});

describe('chunkValues', () => {
  it('keeps every value exactly once', () => {
    const values = Array.from({ length: 33 }, (_, i) => String(i));
    expect(chunkValues(values, 16).flat()).toEqual(values);
  });

  it('refuses a zero size instead of looping forever', () => {
    expect(() => chunkValues(['a'], 0)).toThrow();
  });
});
