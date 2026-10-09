/**
 * „Beliebte Vorlagen": Katalog und Nutzer-Vorlagen gemischt nach Likes,
 * aufgefüllt mit den neuesten (abwechselnd Katalog / Nutzer).
 */
import { type SharepicVorlage } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  buildGalleryTemplates: vi.fn(),
  listSharepicVorlagen: vi.fn(),
  getTemplateScores: vi.fn(),
  getTemplateEngagement: vi.fn(),
}));

vi.mock('../../routes/auth/templates/templateGallery.js', () => ({
  buildGalleryTemplates: m.buildGalleryTemplates,
}));
vi.mock('../sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: m.listSharepicVorlagen,
}));
vi.mock('./templateEngagement.js', () => ({
  getTemplateScores: m.getTemplateScores,
  getTemplateEngagement: m.getTemplateEngagement,
}));

const { listPopularVorlagen, rankPopular } = await import('./popularVorlagen.js');
type Candidate = Parameters<typeof rankPopular>[0][number];

const cat = (id: string): Candidate => ({
  kind: 'catalog',
  id,
  vorlage: { id } as SharepicVorlage,
});
const user = (id: string, day: number): Candidate => ({
  kind: 'user',
  id,
  template: { id },
  createdAt: Date.UTC(2026, 9, day),
});
const ids = (list: Candidate[]) => list.map((c) => c.id);

describe('rankPopular', () => {
  it('ranks by likes across both kinds', () => {
    const scores = new Map([
      ['canva-alt', 2],
      ['k2', 5],
      ['canva-neu', 1],
    ]);
    const ranked = rankPopular(
      [cat('k1'), cat('k2')],
      [user('canva-neu', 9), user('canva-alt', 1)],
      scores,
      3
    );
    expect(ids(ranked)).toEqual(['k2', 'canva-alt', 'canva-neu']);
  });

  it('breaks ties: newer user template first, then catalogue in catalogue order', () => {
    const scores = new Map([
      ['k2', 1],
      ['k1', 1],
      ['u-alt', 1],
      ['u-neu', 1],
    ]);
    const ranked = rankPopular(
      [cat('k1'), cat('k2')],
      [user('u-alt', 1), user('u-neu', 5)],
      scores,
      4
    );
    expect(ids(ranked)).toEqual(['u-neu', 'u-alt', 'k1', 'k2']);
  });

  it('without any likes: newest, alternating catalogue and user templates', () => {
    const ranked = rankPopular(
      [cat('k1'), cat('k2')],
      [user('u-alt', 1), user('u-neu', 5), user('u-mitte', 3)],
      new Map(),
      4
    );
    expect(ids(ranked)).toEqual(['k1', 'u-neu', 'k2', 'u-mitte']);
  });

  it('fills the rest of the row with the newest, without repeating a ranked one', () => {
    const ranked = rankPopular(
      [cat('k1'), cat('k2')],
      [user('u-alt', 1), user('u-neu', 5)],
      new Map([['u-neu', 3]]),
      4
    );
    expect(ids(ranked)).toEqual(['u-neu', 'k1', 'u-alt', 'k2']);
  });

  it('ignores scores of ids that are not candidates (other country, private)', () => {
    const ranked = rankPopular([cat('k1')], [], new Map([['at-only', 9]]), 2);
    expect(ids(ranked)).toEqual(['k1']);
  });
});

describe('listPopularVorlagen', () => {
  const UUID = '11111111-2222-4333-8444-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
    m.listSharepicVorlagen.mockReturnValue([{ id: 'k1' }]);
    m.getTemplateEngagement.mockImplementation(async (list: string[]) =>
      list.map((id) => ({ id, likes_count: id === UUID ? 2 : 0 }))
    );
  });

  it('loads scored user templates by id and the newest, scoped to the country', async () => {
    m.getTemplateScores.mockResolvedValue(
      new Map([
        [UUID, 3],
        ['k1', 1],
      ])
    );
    m.buildGalleryTemplates.mockImplementation(async (f: { ids?: string[] }) =>
      f.ids ? [{ id: UUID, created_at: '2026-01-01' }] : []
    );

    const items = await listPopularVorlagen('de-AT', 4);

    expect(m.listSharepicVorlagen).toHaveBeenCalledWith('de-AT');
    expect(m.buildGalleryTemplates).toHaveBeenCalledWith({ audience: 'de-AT', ids: [UUID] });
    expect(m.buildGalleryTemplates).toHaveBeenCalledWith({ audience: 'de-AT', limit: 4 });
    expect(items.map((i) => i.kind)).toEqual(['user', 'catalog']);
    expect(items[0]).toMatchObject({ kind: 'user', likes_count: 2, template: { id: UUID } });
  });

  it('skips the id lookup when nothing has likes yet', async () => {
    m.getTemplateScores.mockResolvedValue(new Map());
    m.buildGalleryTemplates.mockResolvedValue([{ id: UUID, created_at: '2026-01-01' }]);

    const items = await listPopularVorlagen('de-DE', 4);

    expect(m.buildGalleryTemplates).toHaveBeenCalledTimes(1);
    expect(items.map((i) => (i.kind === 'catalog' ? i.vorlage.id : i.template.id))).toEqual([
      'k1',
      UUID,
    ]);
  });
});
