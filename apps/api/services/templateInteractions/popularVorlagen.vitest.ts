/**
 * „Beliebte Vorlagen": nur der Katalog, nach Likes, sonst in Katalog-Reihenfolge.
 */
import { type SharepicVorlage } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  listSharepicVorlagen: vi.fn(),
  getTemplateScores: vi.fn(),
  getTemplateEngagement: vi.fn(),
}));

vi.mock('../sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: m.listSharepicVorlagen,
}));
vi.mock('./templateEngagement.js', () => ({
  getTemplateScores: m.getTemplateScores,
  getTemplateEngagement: m.getTemplateEngagement,
}));

const { listPopularVorlagen, rankPopular } = await import('./popularVorlagen.js');

const cat = (id: string) => ({ id }) as SharepicVorlage;
const ids = (list: SharepicVorlage[]) => list.map((v) => v.id);

describe('rankPopular', () => {
  it('ranks by likes', () => {
    const ranked = rankPopular(
      [cat('k1'), cat('k2'), cat('k3')],
      new Map([
        ['k3', 5],
        ['k2', 2],
      ]),
      3
    );
    expect(ids(ranked)).toEqual(['k3', 'k2', 'k1']);
  });

  it('keeps catalogue order for ties and without any likes', () => {
    expect(ids(rankPopular([cat('k1'), cat('k2'), cat('k3')], new Map(), 2))).toEqual(['k1', 'k2']);
  });

  it('ignores scores of ids that are not in the catalogue (other country, user templates)', () => {
    expect(ids(rankPopular([cat('k1')], new Map([['canva-uuid', 9]]), 2))).toEqual(['k1']);
  });
});

describe('listPopularVorlagen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.listSharepicVorlagen.mockReturnValue([cat('k1'), cat('k2')]);
    m.getTemplateScores.mockResolvedValue(new Map([['k2', 3]]));
    m.getTemplateEngagement.mockImplementation(async (list: string[]) =>
      list.map((id) => ({ id, likes_count: id === 'k2' ? 3 : 0 }))
    );
  });

  it('returns the viewer country catalogue with like counts', async () => {
    const items = await listPopularVorlagen('de-AT', 4);

    expect(m.listSharepicVorlagen).toHaveBeenCalledWith('de-AT');
    expect(items).toEqual([
      { kind: 'catalog', vorlage: cat('k2'), likes_count: 3 },
      { kind: 'catalog', vorlage: cat('k1'), likes_count: 0 },
    ]);
  });
});
