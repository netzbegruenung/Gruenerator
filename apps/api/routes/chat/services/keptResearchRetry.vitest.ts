import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { getKeptResearchForRetry } = await import('./threadPersistenceService.js');

const SOURCES = [
  { source: 'web', title: 'Statistik Austria', content: 'inhalt', url: 'https://a' },
];

function keptRow(overrides: Record<string, unknown> = {}) {
  return [
    {
      tool_results: {
        keptOnFailure: true,
        researchQuery: 'Anteil erneuerbarer Energien Österreich 2025',
        searchResults: SOURCES,
        ...overrides,
      },
    },
  ];
}

/**
 * A deep-research run costs ~17s and a paid Linkup call. When the GENERATION
 * afterwards failed, the retry re-ran the whole thing 36 seconds after the
 * sources had been persisted (observed live). This is the lookup that stops it.
 */
describe('getKeptResearchForRetry', () => {
  beforeEach(() => query.mockReset());

  it('returns the kept sources when the same question is asked again', async () => {
    query.mockResolvedValue(keptRow());
    const out = await getKeptResearchForRetry('t1', 'Anteil erneuerbarer Energien Österreich 2025');
    expect(out?.searchResults).toEqual(SOURCES);
  });

  it('matches modulo case, punctuation and whitespace', async () => {
    query.mockResolvedValue(keptRow());
    const out = await getKeptResearchForRetry(
      't1',
      '  anteil erneuerbarer   energien, österreich 2025!  '
    );
    expect(out).not.toBeNull();
  });

  // The old row also carried a `researchMeta` (Linkup's own written answer) so
  // the Recherche-Karte survived a retry. There is no card to restore any more:
  // the sources ARE the salvage, and the model writes the answer from them.
  it('reuses a legacy kept row, ignoring the research meta it still carries', async () => {
    query.mockResolvedValue(keptRow({ researchMeta: { answer: 'Rund 87 Prozent.' } }));
    const out = await getKeptResearchForRetry('t1', 'Anteil erneuerbarer Energien Österreich 2025');
    expect(out?.searchResults).toEqual(SOURCES);
    expect(out).not.toHaveProperty('researchMeta');
  });

  it('does NOT reuse anything for a different question', async () => {
    query.mockResolvedValue(keptRow());
    expect(await getKeptResearchForRetry('t1', 'Wie hoch ist die Inflation?')).toBeNull();
  });

  it('ignores an ordinary assistant row — only a kept-on-failure row counts', async () => {
    query.mockResolvedValue([{ tool_results: { searchResults: SOURCES } }]);
    expect(
      await getKeptResearchForRetry('t1', 'Anteil erneuerbarer Energien Österreich 2025')
    ).toBeNull();
  });

  it('ignores a kept row that carried no sources', async () => {
    query.mockResolvedValue(keptRow({ searchResults: [] }));
    expect(
      await getKeptResearchForRetry('t1', 'Anteil erneuerbarer Energien Österreich 2025')
    ).toBeNull();
  });

  it('tolerates an empty thread and an empty query', async () => {
    query.mockResolvedValue([]);
    expect(await getKeptResearchForRetry('t1', 'irgendwas')).toBeNull();
    query.mockResolvedValue(keptRow());
    expect(await getKeptResearchForRetry('t1', '   ')).toBeNull();
  });

  /**
   * The retry window closes as soon as a normal answer follows: only the NEWEST
   * assistant row is inspected, so a later question never silently reuses an
   * older run's sources.
   */
  it('reads only the newest assistant row', async () => {
    query.mockResolvedValue(keptRow());
    await getKeptResearchForRetry('t1', 'Anteil erneuerbarer Energien Österreich 2025');
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC LIMIT 1/);
  });
});
