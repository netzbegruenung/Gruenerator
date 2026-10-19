import { describe, expect, it } from 'vitest';

import {
  LEGACY_DEFAULT_KINDS,
  MARKETPLACE_KINDS,
  marketplaceListQuerySchema,
} from './marketplace.js';

describe('marketplaceListQuerySchema', () => {
  it('defaults to the legacy kinds, sort empfohlen and the shop', () => {
    expect(marketplaceListQuerySchema.parse({})).toEqual({
      kinds: [...LEGACY_DEFAULT_KINDS],
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

  it('never hands a kind added later to a client that did not name it', () => {
    // A shipped build sends the list compiled into it; one without the
    // parameter gets the kinds the first clients knew — never `notebook`.
    const shipped = 'agent,recipe,template,sticker,background';
    expect(marketplaceListQuerySchema.parse({ kinds: shipped }).kinds).not.toContain('notebook');
    expect(marketplaceListQuerySchema.parse({}).kinds).not.toContain('notebook');
    expect(MARKETPLACE_KINDS).toContain('notebook');
  });

  it('serves notebooks to a client that asks for them', () => {
    expect(marketplaceListQuerySchema.parse({ kinds: 'notebook,agent' }).kinds).toEqual([
      'agent',
      'notebook',
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
