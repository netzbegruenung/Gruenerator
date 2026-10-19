/**
 * Die Startseite in einer Antwort: je Regal eine Liste mit den Filtern aus
 * `FRONTPAGE_SHELF_QUERIES`, dazu das „Im Fokus"-Element. Die Regalregeln
 * selbst prüft `frontpage.vitest.ts` in `packages/shared`; hier geht es um
 * die Abfragen, das Land und den Landesverband.
 */
import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type MarketplaceContext } from './context.js';

import type { SourceQuery } from './sources/types.js';

const m = vi.hoisted(() => ({
  list: vi.fn<(kind: MarketplaceKind, query: SourceQuery) => Promise<unknown>>(),
  get: vi.fn<(kind: MarketplaceKind, ref: string) => Promise<MarketplaceItem | null>>(),
}));

vi.mock('../entityLikes/EntityLikesService.js', () => ({
  likeEntity: vi.fn(),
  unlikeEntity: vi.fn(),
}));
vi.mock('./registry.js', () => ({
  sourceOf: (kind: MarketplaceKind) => ({
    list: (ctx: unknown, query: SourceQuery) => m.list(kind, query),
    get: (ctx: unknown, ref: string) => m.get(kind, ref),
  }),
}));

const { getMarketplaceFrontpage } = await import('./marketplaceService.js');

function item(kind: MarketplaceKind, ref: string, over: Partial<MarketplaceItem> = {}) {
  return {
    kind,
    ref,
    key: `${kind}:${ref}`,
    origin: 'offiziell',
    title: ref,
    createdAt: '2026-10-01T00:00:00.000Z',
    likesCount: 0,
    ...over,
  } as MarketplaceItem;
}

function ctx(lv: boolean, audience: 'de-DE' | 'de-AT' = 'de-DE'): MarketplaceContext {
  const catalog = () =>
    Promise.resolve({
      lvAgents: lv ? [{ identifier: 'lv-agent' }] : [],
      lvSkills: [],
    } as unknown as Awaited<ReturnType<MarketplaceContext['officialCatalog']>>);
  return {
    resolvableCatalog: catalog,
    userId: 'viewer',
    audience,
    instanceId: 'gruenerator' as MarketplaceContext['instanceId'],
    platform: 'mobile',
    officialCatalog: catalog,
  };
}

/** Every list answers two items per kind, so each shelf above its minimum shows. */
function catalogue() {
  m.list.mockImplementation((kind: MarketplaceKind, query: SourceQuery) =>
    Promise.resolve({
      items: [1, 2, 3, 4, 5].map((n) =>
        item(kind, `${kind}-${query.origin ?? 'all'}-${query.sort}-${n}`, {
          likesCount: n,
          createdAt: `2026-10-0${n}T00:00:00.000Z`,
        })
      ),
      hasMore: false,
    })
  );
}

const listed = () =>
  m.list.mock.calls.map(([kind, q]) => ({
    kind,
    sort: q.sort,
    origin: q.origin,
    limit: q.limit,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  catalogue();
});

describe('getMarketplaceFrontpage', () => {
  it('asks each shelf’s kinds with its sort, origin and size, and keeps the shelf order', async () => {
    m.get.mockResolvedValue(item('agent', 'gruenerator-leichte-sprache'));
    const page = await getMarketplaceFrontpage(ctx(true));

    expect(listed()).toEqual(
      expect.arrayContaining([
        { kind: 'agent', sort: 'empfohlen', origin: 'landesverband', limit: 4 },
        { kind: 'recipe', sort: 'empfohlen', origin: 'landesverband', limit: 4 },
        { kind: 'agent', sort: 'neu', origin: null, limit: 5 },
        { kind: 'recipe', sort: 'beliebt', origin: null, limit: 6 },
        { kind: 'template', sort: 'empfohlen', origin: null, limit: 9 },
        { kind: 'sticker', sort: 'empfohlen', origin: null, limit: 9 },
        { kind: 'background', sort: 'empfohlen', origin: null, limit: 9 },
      ])
    );
    expect(m.list).toHaveBeenCalledTimes(9);
    expect(page.shelves.map((s) => s.shelfId)).toEqual([
      'landesverband',
      'neu',
      'beliebt',
      'gestalten',
    ]);
    expect(page.featured?.ref).toBe('gruenerator-leichte-sprache');
    expect(page.featureId).toBe('leichte-sprache');
  });

  it('does not list the Landesverband shelf for a viewer without one', async () => {
    m.get.mockResolvedValue(item('agent', 'gruenerator-leichte-sprache'));
    const page = await getMarketplaceFrontpage(ctx(false));

    expect(listed().some((q) => q.origin === 'landesverband')).toBe(false);
    expect(page.shelves.map((s) => s.shelfId)).not.toContain('landesverband');
  });

  it('falls back to the newest official item when the curated one is not visible', async () => {
    m.get.mockResolvedValue(null);
    const page = await getMarketplaceFrontpage(ctx(false, 'de-AT'));

    expect(m.get).toHaveBeenCalledWith('agent', 'gruenerator-leichte-sprache');
    expect(page.featureId).toBeNull();
    expect(page.featured?.createdAt).toBe('2026-10-05T00:00:00.000Z');
    const neu = page.shelves.find((s) => s.shelfId === 'neu')!;
    expect(neu.items.map((i) => i.key)).not.toContain(page.featured?.key);
  });
});
