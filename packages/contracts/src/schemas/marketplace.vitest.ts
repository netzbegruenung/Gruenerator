import { describe, expect, it } from 'vitest';

import { MARKETPLACE_KINDS, marketplaceListQuerySchema } from './marketplace.js';

describe('marketplaceListQuerySchema', () => {
  it('defaults to every kind, sort empfohlen and the shop', () => {
    expect(marketplaceListQuerySchema.parse({})).toEqual({
      kinds: [...MARKETPLACE_KINDS],
      origin: null,
      q: null,
      sort: 'empfohlen',
      scope: 'shop',
      platform: 'web',
      offset: 0,
      limit: 24,
      sectionLimit: 12,
    });
  });

  it('keeps known kinds in registry order and drops unknown ones', () => {
    expect(marketplaceListQuerySchema.parse({ kinds: 'sticker, agent,hologram' }).kinds).toEqual([
      'agent',
      'sticker',
    ]);
  });

  it('answers a declaration of only unknown kinds with no kind at all', () => {
    expect(marketplaceListQuerySchema.parse({ kinds: 'hologram' }).kinds).toEqual([]);
  });

  it('trims q to null when empty and caps it at 80 characters', () => {
    expect(marketplaceListQuerySchema.parse({ q: '   ' }).q).toBeNull();
    expect(marketplaceListQuerySchema.parse({ q: ' klima ' }).q).toBe('klima');
    expect(marketplaceListQuerySchema.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
  });

  it('caps limit at 60', () => {
    expect(marketplaceListQuerySchema.safeParse({ limit: '61' }).success).toBe(false);
    expect(marketplaceListQuerySchema.parse({ limit: '60', offset: '12' })).toMatchObject({
      limit: 60,
      offset: 12,
    });
  });
});
