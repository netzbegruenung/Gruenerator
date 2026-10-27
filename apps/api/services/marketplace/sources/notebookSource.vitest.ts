/**
 * Notebook-Quelle: die öffentlichen Notebooks aus der einen Auswahl
 * (`listPublicNotebooksForViewer`), mit Anzeigenamen statt E-Mail-Teil, und
 * „Merken" als Lesezeichen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { SourceQuery } from './types.js';

const m = vi.hoisted(() => ({
  listPublicNotebooksForViewer: vi.fn(),
  profiles: [] as { id: string; name: string | null }[],
  favorites: new Set<string>(),
  favoriteEntity: vi.fn(),
  unfavoriteEntity: vi.fn(),
}));

vi.mock('../../notebook/publicNotebookListing.js', () => ({
  listPublicNotebooksForViewer: m.listPublicNotebooksForViewer,
}));
vi.mock('../../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: async () => m.profiles }) }),
  }),
}));
vi.mock('../../entityFavorites/EntityFavoritesService.js', () => ({
  favoriteEntity: m.favoriteEntity,
  unfavoriteEntity: m.unfavoriteEntity,
}));
vi.mock('../enrich.js', () => ({
  favoritedAmong: async (_userId: string, _type: string, refs: string[]) =>
    new Set(refs.filter((r) => m.favorites.has(r))),
  enrichItems: async (
    ctx: unknown,
    source: { save: { has: (c: unknown, r: string[]) => Promise<Set<string>> } },
    items: Array<{ ref: string; saved: boolean }>
  ) => {
    const saved = await source.save.has(
      ctx,
      items.map((i) => i.ref)
    );
    for (const i of items) i.saved = saved.has(i.ref);
    return items;
  },
}));

const { buildMarketplaceContext } = await import('../context.js');
const { notebookSource } = await import('./notebookSource.js');

const notebook = (over: Partial<NotebookCollection>): NotebookCollection =>
  ({
    id: 'n1',
    user_id: 'owner-1',
    name: 'Klimaschutz',
    description: 'Beschlüsse und Studien',
    audience: 'de-DE',
    slug_suffix: 'Ab3xK9',
    created_at: '2026-10-01T00:00:00.000Z',
    is_public: true,
    share_mode: 'authenticated',
    moderation: 'ok',
    ...over,
  }) as NotebookCollection;

const query = (o: Partial<SourceQuery> = {}): SourceQuery => ({
  origin: null,
  q: null,
  sort: 'empfohlen',
  scope: 'shop',
  offset: 0,
  limit: 50,
  systemRecipes: false,
  ...o,
});

const ctx = (locale = 'de-DE') =>
  buildMarketplaceContext({ userId: 'viewer', locale, platform: 'web' });

beforeEach(() => {
  vi.clearAllMocks();
  m.profiles = [{ id: 'owner-1', name: '  Kim Beispiel ' }];
  m.favorites = new Set();
  m.listPublicNotebooksForViewer.mockResolvedValue([
    notebook({}),
    notebook({
      id: 'n2',
      name: 'Verkehr',
      description: null,
      user_id: 'owner-2',
      slug_suffix: null,
    }),
    notebook({ id: 'own', name: 'Mein Notebook', user_id: 'viewer' }),
  ]);
});

describe('notebookSource', () => {
  it('lists the public selection for the viewer’s country as notebook items', async () => {
    await notebookSource.list(ctx('de-AT'), query());
    expect(m.listPublicNotebooksForViewer).toHaveBeenCalledWith('de-AT');

    const page = await notebookSource.list(ctx(), query());
    expect(page.items.map((i) => i.ref)).toEqual(['n1', 'n2', 'own']);
    expect(page.items[0]).toMatchObject({
      kind: 'notebook',
      key: 'notebook:n1',
      origin: 'oeffentlich',
      title: 'Klimaschutz',
      reportKind: 'notebook',
      isOwn: false,
      notebook: { slug: 'klimaschutz-Ab3xK9' },
    });
  });

  it('names authors by display name only, never by their email address', async () => {
    const [first, second] = (await notebookSource.list(ctx(), query())).items;
    expect(first?.authorName).toBe('Kim Beispiel');
    expect(second?.authorName).toBeNull();
  });

  it('falls back to the uuid for a notebook without a slug suffix, and marks one’s own', async () => {
    const items = (await notebookSource.list(ctx(), query())).items;
    expect(items.find((i) => i.ref === 'n2')?.notebook.slug).toBe('n2');
    expect(items.find((i) => i.ref === 'own')?.isOwn).toBe(true);
  });

  it('searches title and description, and „saved" keeps only bookmarked ones', async () => {
    expect(
      (await notebookSource.list(ctx(), query({ q: 'studien' }))).items.map((i) => i.ref)
    ).toEqual(['n1', 'own']);

    m.favorites = new Set(['n2']);
    expect(
      (await notebookSource.list(ctx(), query({ scope: 'saved' }))).items.map((i) => i.ref)
    ).toEqual(['n2']);
  });

  it('is visible only while the selection lists it', async () => {
    expect(await notebookSource.isVisible(ctx(), 'n1')).toBe(true);
    expect(await notebookSource.isVisible(ctx(), 'unlisted')).toBe(false);
    expect(await notebookSource.get(ctx(), 'unlisted')).toBeNull();
    expect((await notebookSource.get(ctx(), 'n1'))?.title).toBe('Klimaschutz');
  });

  it('bookmarks as `notebook` in entity_favorites', async () => {
    expect(await notebookSource.save.add(ctx(), 'n1')).toBe('ok');
    await notebookSource.save.remove(ctx(), 'n1');
    expect(m.favoriteEntity).toHaveBeenCalledWith({
      userId: 'viewer',
      entityType: 'notebook',
      entityId: 'n1',
    });
    expect(m.unfavoriteEntity).toHaveBeenCalledWith({
      userId: 'viewer',
      entityType: 'notebook',
      entityId: 'n1',
    });
  });
});
