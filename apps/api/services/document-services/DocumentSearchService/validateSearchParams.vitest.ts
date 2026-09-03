/**
 * Guardrail for the search-option normalizer.
 *
 * `validateSearchParams` has three branches (nested-options, flat/system,
 * legacy). Only the nested one rebuilt its options object field by field, and it
 * silently omitted `mode` and `recallLimit` — so every caller passing
 * `options: { mode: 'hybrid' }` (chat direct search, notebook Q&A, research,
 * examples, the Grundsatz node) fell through to `mode || 'vector'` in `search()`
 * and ran vector-only, while the response still reported "hybrid". The notebook
 * and research "Volltext" toggles computed `mode: 'text'` that never arrived.
 *
 * These tests pin the routing-relevant options across all three branches.
 */

import { describe, it, expect } from 'vitest';

import { DocumentSearchService } from './DocumentSearchService.js';

import type { SearchParams } from '../../search-services/BaseSearchService/types.js';

const service = new DocumentSearchService();
const validate = (params: unknown) =>
  service.validateSearchParams(params as unknown as SearchParams);

describe('validateSearchParams — nested options branch', () => {
  const nested = (options: Record<string, unknown>) =>
    validate({ query: 'Klimaschutz', userId: undefined, options });

  it('preserves mode so search() can route to hybrid', () => {
    expect(nested({ mode: 'hybrid', searchCollection: 'grundsatz_documents' }).options.mode).toBe(
      'hybrid'
    );
  });

  it('preserves text mode — the Volltext toggle depends on it', () => {
    expect(nested({ mode: 'text', searchCollection: 'grundsatz_documents' }).options.mode).toBe(
      'text'
    );
  });

  it('preserves recallLimit so per-collection recall is not reset to limit * 4', () => {
    expect(
      nested({ mode: 'hybrid', recallLimit: 60, searchCollection: 'grundsatz_documents' }).options
        .recallLimit
    ).toBe(60);
  });

  it('leaves mode undefined when the caller omits it (search() defaults to vector)', () => {
    expect(nested({ searchCollection: 'grundsatz_documents' }).options.mode).toBeUndefined();
  });

  it('still normalizes the options it already handled', () => {
    const out = nested({
      mode: 'hybrid',
      limit: 12,
      qualityMin: 0.4,
      useCache: false,
      searchCollection: 'grundsatz_documents',
    }).options;
    expect(out.limit).toBe(12);
    expect(out.qualityMin).toBe(0.4);
    expect(out.useCache).toBe(false);
  });

  it('carries rerankChunks: true through to the validated options', () => {
    expect(
      nested({ mode: 'hybrid', rerankChunks: true, searchCollection: 'grundsatz_documents' })
        .options.rerankChunks
    ).toBe(true);
  });

  it('omits rerankChunks when the caller does not set it', () => {
    expect(
      nested({ mode: 'hybrid', searchCollection: 'grundsatz_documents' }).options
    ).not.toHaveProperty('rerankChunks');
  });

  it('omits rerankChunks for any non-true value', () => {
    expect(
      nested({
        mode: 'hybrid',
        rerankChunks: false,
        searchCollection: 'grundsatz_documents',
      }).options
    ).not.toHaveProperty('rerankChunks');
    expect(
      nested({
        mode: 'hybrid',
        rerankChunks: 'yes',
        searchCollection: 'grundsatz_documents',
      }).options
    ).not.toHaveProperty('rerankChunks');
  });
});

describe('validateSearchParams — the branches that were already correct', () => {
  it('flat system-collection params keep mode and recallLimit', () => {
    const out = validate({
      query: 'Klimaschutz',
      searchCollection: 'grundsatz_documents',
      user_id: null,
      mode: 'hybrid',
      recallLimit: 50,
    }).options;
    expect(out.mode).toBe('hybrid');
    expect(out.recallLimit).toBe(50);
  });
});

/**
 * Die Naht des Einbettungs-Bake-offs. `queryVector` muss die Positivliste
 * überleben, sonst bettet `generateQueryEmbedding` still mit `mistral-embed`
 * ein und misst eine fremd eingebettete Sammlung — das Ergebnis sähe nur nach
 * schlechtem Retrieval aus.
 */
describe('validateSearchParams — queryVector', () => {
  const vector = [0.1, 0.2, 0.3];

  it('survives the nested-options branch', () => {
    expect(
      validate({
        query: 'Klimaschutz',
        userId: undefined,
        options: { searchCollection: 'grundsatz_documents', queryVector: vector },
      }).options.queryVector
    ).toEqual(vector);
  });

  it('survives the flat system-collection branch', () => {
    expect(
      validate({
        query: 'Klimaschutz',
        searchCollection: 'grundsatz_documents',
        user_id: null,
        queryVector: vector,
      }).options.queryVector
    ).toEqual(vector);
  });

  it('is absent when not supplied, and when supplied empty or malformed', () => {
    const nested = (options: Record<string, unknown>) =>
      validate({ query: 'Klimaschutz', userId: undefined, options }).options;
    expect(nested({ searchCollection: 'grundsatz_documents' })).not.toHaveProperty('queryVector');
    expect(nested({ searchCollection: 'grundsatz_documents', queryVector: [] })).not.toHaveProperty(
      'queryVector'
    );
    expect(
      nested({ searchCollection: 'grundsatz_documents', queryVector: 'nope' })
    ).not.toHaveProperty('queryVector');
  });
});
