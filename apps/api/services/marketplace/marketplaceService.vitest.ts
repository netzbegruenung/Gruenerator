/**
 * Der Server antwortet nur auf die Arten, die ein Client nennt — so bleiben
 * ausgelieferte Mobile-Binaries heil, wenn eine Art dazukommt (Notebooks,
 * #4733). Geprüft am echten Query-Schema und an der echten Verteilung, mit
 * Attrappen als Quellen.
 */
import { marketplaceListQuerySchema, type MarketplaceKind } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listed = vi.hoisted(() => [] as string[]);

vi.mock('./registry.js', () => ({
  sourceOf: (kind: string) => ({
    kind,
    list: async () => {
      listed.push(kind);
      return { items: [], hasMore: false };
    },
  }),
}));

const { listMarketplace } = await import('./marketplaceService.js');
const { buildMarketplaceContext } = await import('./context.js');

const ctx = buildMarketplaceContext({ userId: 'viewer', locale: 'de-DE', platform: 'mobile' });
const kindsOf = async (query: Record<string, string>) =>
  (await listMarketplace(ctx, marketplaceListQuerySchema.parse(query))).sections.map((s) => s.kind);

/** What a binary built before notebooks compiled into its `kinds` declaration. */
const SHIPPED_KINDS: MarketplaceKind[] = ['agent', 'recipe', 'template', 'sticker', 'background'];

beforeEach(() => {
  listed.length = 0;
});

describe('listMarketplace — kinds as the client’s capability declaration', () => {
  it('never answers a shipped binary with notebooks, nor asks the notebook source', async () => {
    expect(await kindsOf({ kinds: SHIPPED_KINDS.join(',') })).toEqual(SHIPPED_KINDS);
    expect(listed).not.toContain('notebook');
  });

  it('gives a client that names no kinds the legacy five, not every kind', async () => {
    expect(await kindsOf({})).toEqual(SHIPPED_KINDS);
    expect(listed).not.toContain('notebook');
  });

  it('serves notebooks to a client that declares them', async () => {
    expect(await kindsOf({ kinds: 'notebook' })).toEqual(['notebook']);
    expect(await kindsOf({ kinds: [...SHIPPED_KINDS, 'notebook'].join(',') })).toContain(
      'notebook'
    );
  });
});
