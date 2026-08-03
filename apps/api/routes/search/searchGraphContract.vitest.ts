/**
 * Body-validation tests for the /api/search-graph/stream contract.
 *
 * Before the contract existed the handler cast req.body and read `searchMode`
 * as a free string, so anything that wasn't literally 'deep' silently became
 * 'web'. These tests pin the closed set down at the wire boundary and guard the
 * "query OR messages" precondition the handler relies on.
 */

import { searchGraphStreamBodySchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const base = { query: 'Windkraft in Österreich' };

describe('searchGraphStreamBodySchema — searchMode', () => {
  it.each(['web', 'deep'])('accepts the %s depth', (searchMode) => {
    expect(searchGraphStreamBodySchema.safeParse({ ...base, searchMode }).success).toBe(true);
  });

  it.each(['hybrid', 'DEEP', 'standard', '', 'fast'])('rejects %o', (searchMode) => {
    expect(searchGraphStreamBodySchema.safeParse({ ...base, searchMode }).success).toBe(false);
  });

  it('rejects a non-string depth', () => {
    expect(searchGraphStreamBodySchema.safeParse({ ...base, searchMode: 1 }).success).toBe(false);
  });

  it('omitted / null depth is allowed — the handler defaults to web', () => {
    expect(searchGraphStreamBodySchema.safeParse(base).success).toBe(true);
    expect(searchGraphStreamBodySchema.safeParse({ ...base, searchMode: null }).success).toBe(true);
  });
});

describe('searchGraphStreamBodySchema — query / messages', () => {
  it('accepts a bare query', () => {
    expect(searchGraphStreamBodySchema.safeParse(base).success).toBe(true);
  });

  it('accepts messages without a query', () => {
    const result = searchGraphStreamBodySchema.safeParse({
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'hallo' }] }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts plain content messages (voice / simple callers)', () => {
    const result = searchGraphStreamBodySchema.safeParse({
      messages: [{ role: 'user', content: 'hallo' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body with neither query nor messages', () => {
    expect(searchGraphStreamBodySchema.safeParse({}).success).toBe(false);
    expect(searchGraphStreamBodySchema.safeParse({ query: '', messages: [] }).success).toBe(false);
  });

  it('rejects a message with neither parts nor content', () => {
    const result = searchGraphStreamBodySchema.safeParse({
      messages: [{ role: 'user' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown role', () => {
    const result = searchGraphStreamBodySchema.safeParse({
      messages: [{ role: 'tool', content: 'x' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('searchGraphStreamBodySchema — locale', () => {
  it('drops a client-supplied locale: it is derived from the profile server-side', () => {
    const result = searchGraphStreamBodySchema.safeParse({ ...base, locale: 'de-AT' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('locale');
  });
});
