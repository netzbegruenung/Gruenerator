/**
 * Guardrail for the shared chunk-payload mapper.
 *
 * Pins the fix for per-search-mode field drift: vector, hybrid AND text search
 * all spread `buildChunkPayloadFields`, so every payload-derived field is
 * populated identically across modes. The `published_at` / `quality_score` /
 * `page_number` bug happened because the text mapper hand-built a subset; this
 * test fails if a field ever stops being mapped.
 */

import { describe, it, expect } from 'vitest';

import { buildChunkPayloadFields } from './searchOperations.js';
import type { QdrantResultPayload } from './types.js';

const FULL_PAYLOAD: QdrantResultPayload = {
  document_id: 'doc-1',
  chunk_index: 3,
  chunk_text: 'hello',
  token_count: 42,
  quality_score: 0.8,
  content_type: 'paragraph',
  page_number: 7,
  chunk_type: 'table',
  created_at: '2024-01-01T00:00:00Z',
  title: 'A Title',
  filename: 'file.pdf',
  // index-signature fields (web/scraped payloads)
  published_at: '2024-03-01T00:00:00Z',
  source_url: 'https://example.org/x',
  source_id: 'src-9',
};

// Every payload-derived field the downstream pipeline relies on. If a mapper
// regresses (drops one), this list is the contract that catches it.
const REQUIRED_KEYS = [
  'document_id',
  'chunk_index',
  'chunk_text',
  'token_count',
  'quality_score',
  'content_type',
  'page_number',
  'chunk_type',
  'created_at',
  'published_at',
  'source_id',
  'url',
  'documents',
] as const;

describe('buildChunkPayloadFields', () => {
  it('maps every payload-derived field (the ones text search used to drop)', () => {
    const out = buildChunkPayloadFields(FULL_PAYLOAD);
    expect(out.quality_score).toBe(0.8);
    expect(out.page_number).toBe(7);
    expect(out.content_type).toBe('paragraph');
    expect(out.chunk_type).toBe('table');
    expect(out.source_id).toBe('src-9');
    expect(out.published_at).toBe('2024-03-01T00:00:00Z');
    expect(out.url).toBe('https://example.org/x');
    expect(out.documents).toEqual({
      id: 'doc-1',
      title: 'A Title',
      filename: 'file.pdf',
      created_at: '2024-01-01T00:00:00Z',
    });
  });

  it('exposes the full required key set (drift guard)', () => {
    const out = buildChunkPayloadFields(FULL_PAYLOAD) as Record<string, unknown>;
    for (const key of REQUIRED_KEYS) {
      expect(out).toHaveProperty(key);
    }
  });

  it('falls back to metadata.published_at and source_url-derived document_id', () => {
    const out = buildChunkPayloadFields({
      source_url: 'https://e.org/a',
      chunk_index: 0,
      chunk_text: 't',
      metadata: { published_at: '2022-05-05', title: 'Meta Title' },
    });
    expect(out.published_at).toBe('2022-05-05');
    expect(out.document_id).toBe('https://e.org/a');
    expect(out.documents.title).toBe('Meta Title');
  });

  it('returns safe defaults for an empty/undefined payload (no throw)', () => {
    const out = buildChunkPayloadFields(undefined);
    expect(out.document_id).toBe('');
    expect(out.quality_score).toBeNull();
    expect(out.page_number).toBeNull();
    expect(out.chunk_type).toBeNull();
    expect(out.published_at).toBeNull();
    expect(out.documents.title).toBe('Untitled');
  });
});
