import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { getRecentThreadSources } = await import('./threadPersistenceService.js');

function row(...sources: Array<{ title: string; url?: string; content?: string }>) {
  return {
    tool_results: {
      searchResults: sources.map((s) => ({
        source: 'web',
        title: s.title,
        content: s.content ?? 'inhalt',
        ...(s.url != null && { url: s.url }),
      })),
    },
  };
}

/**
 * Rows arrive newest-first. The loader used to RETURN at the first row carrying
 * any sources at all, so one incidental lookup shadowed the research before it.
 */
describe('getRecentThreadSources', () => {
  beforeEach(() => query.mockReset());

  it('does not let one incidental source hide an earlier deep dive', async () => {
    query.mockResolvedValue([
      row({ title: 'Umfrage', url: 'https://poll' }), // newest: one casual lookup
      row(
        ...Array.from({ length: 10 }, (_, i) => ({
          title: `Recherche ${i}`,
          url: `https://r/${i}`,
        }))
      ),
    ]);
    const out = await getRecentThreadSources('t1');
    expect(out).toHaveLength(10);
    expect(out[0]?.title).toBe('Umfrage');
    expect(out.map((r) => r.title)).toContain('Recherche 0');
  });

  it('keeps newest-first ordering across messages', async () => {
    query.mockResolvedValue([
      row({ title: 'neu', url: 'https://a' }),
      row({ title: 'alt', url: 'https://b' }),
    ]);
    const out = await getRecentThreadSources('t1');
    expect(out.map((r) => r.title)).toEqual(['neu', 'alt']);
  });

  it('respects the limit and stops early', async () => {
    query.mockResolvedValue([
      row(...Array.from({ length: 8 }, (_, i) => ({ title: `a${i}`, url: `https://a/${i}` }))),
      row(...Array.from({ length: 8 }, (_, i) => ({ title: `b${i}`, url: `https://b/${i}` }))),
    ]);
    expect(await getRecentThreadSources('t1', 10)).toHaveLength(10);
  });

  it('dedupes a source that appears in several turns', async () => {
    query.mockResolvedValue([
      row({ title: 'Gleich', url: 'https://same' }),
      row({ title: 'Gleich', url: 'https://same' }),
      row({ title: 'Anders', url: 'https://other' }),
    ]);
    const out = await getRecentThreadSources('t1');
    expect(out).toHaveLength(2);
  });

  it('skips empty-content entries without giving up on the row', async () => {
    query.mockResolvedValue([
      row({ title: 'Leer', url: 'https://x', content: '   ' }, { title: 'Voll', url: 'https://y' }),
    ]);
    const out = await getRecentThreadSources('t1');
    expect(out.map((r) => r.title)).toEqual(['Voll']);
  });

  it('returns an empty array when nothing was ever persisted', async () => {
    query.mockResolvedValue([]);
    expect(await getRecentThreadSources('t1')).toEqual([]);
  });

  it('tolerates malformed tool_results', async () => {
    query.mockResolvedValue([
      { tool_results: 'kaputt' },
      { tool_results: { searchResults: null } },
    ]);
    expect(await getRecentThreadSources('t1')).toEqual([]);
  });
});
