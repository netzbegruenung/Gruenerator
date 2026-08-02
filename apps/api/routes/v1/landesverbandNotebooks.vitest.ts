/**
 * `/api/v1/notebooks/search` und das MCP-Werkzeug `notebooks_search` teilen sich
 * diesen Abrufpfad.
 *
 * Er lief vorher über `askSingleCollection({ fastMode: true })` — und dessen
 * Zweig verlässt die Funktion mit `citations: []` und `sources: []`, weil er die
 * Zitatverarbeitung überspringt. Genau die beiden Felder waren die ganze
 * Antwort der Route: sie gab eine leere Trefferliste zurück und bezahlte dafür
 * einen Modellentwurf, den niemand je gesehen hat.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getSearchContext = vi.fn();
const askSingleCollection = vi.fn();

vi.mock('../../services/notebook/index.js', () => ({
  notebookQAService: {
    getSearchContext: (...a: unknown[]) => getSearchContext(...a),
    askSingleCollection: (...a: unknown[]) => askSingleCollection(...a),
  },
}));

vi.mock('./landesverbandMap.js', () => ({
  getSystemCollectionIdForLandesverband: (lv: string) => ({ HH: 'hamburg-system' })[lv] ?? null,
  listSupportedLandesverbaende: () => [
    { code: 'HH', collectionId: 'hamburg-system', name: 'Hamburg' },
    { code: 'BY', collectionId: 'bayern-system', name: 'Bayern' },
  ],
}));

const { searchLandesverbandChunks, resolveLandesverband, listAllowedLandesverbaende } =
  await import('./landesverbandNotebooks.js');

const chunk = (over: Record<string, unknown> = {}) => ({
  document_id: 'doc-1',
  source_url: 'https://gruene-hamburg.de/a',
  title: 'Beschluss',
  snippet: 'Auszug.',
  filename: null,
  similarity: 0.8,
  chunk_index: 0,
  page_number: null,
  ...over,
});

beforeEach(() => {
  getSearchContext.mockReset();
  askSingleCollection.mockReset();
});

describe('searchLandesverbandChunks', () => {
  it('holt die Belegstellen ohne Modellaufruf', async () => {
    getSearchContext.mockResolvedValue({ sortedResults: [chunk()] });
    const out = await searchLandesverbandChunks({
      collectionId: 'hamburg-system',
      query: 'Verkehr',
    });
    expect(out).toHaveLength(1);
    expect(askSingleCollection).not.toHaveBeenCalled();
  });

  it('bildet die Felder ab, auf die ein Zitat sich stützt', async () => {
    getSearchContext.mockResolvedValue({
      sortedResults: [chunk({ date: '2026-01-01', similarity: 0.42 })],
    });
    const [first] = await searchLandesverbandChunks({
      collectionId: 'hamburg-system',
      query: 'Verkehr',
    });
    expect(first).toEqual({
      documentId: 'doc-1',
      title: 'Beschluss',
      url: 'https://gruene-hamburg.de/a',
      excerpt: 'Auszug.',
      similarity: 0.42,
      date: '2026-01-01',
    });
  });

  it('fällt für das Datum auf published_at zurück', async () => {
    getSearchContext.mockResolvedValue({
      sortedResults: [chunk({ published_at: '2025-06-01' })],
    });
    const [first] = await searchLandesverbandChunks({
      collectionId: 'hamburg-system',
      query: 'Verkehr',
    });
    expect(first?.date).toBe('2025-06-01');
  });

  it('begrenzt auf limit und lässt es sonst weg', async () => {
    getSearchContext.mockResolvedValue({ sortedResults: [chunk(), chunk(), chunk()] });
    expect(
      await searchLandesverbandChunks({ collectionId: 'hamburg-system', query: 'x', limit: 2 })
    ).toHaveLength(2);
    expect(
      await searchLandesverbandChunks({ collectionId: 'hamburg-system', query: 'x' })
    ).toHaveLength(3);
  });

  it('reicht Filter durch und lässt sie sonst weg', async () => {
    getSearchContext.mockResolvedValue({ sortedResults: [] });
    await searchLandesverbandChunks({
      collectionId: 'hamburg-system',
      query: 'x',
      filters: { primary_category: 'Mobilität' },
    });
    expect(getSearchContext.mock.calls[0]?.[0].requestFilters).toEqual({
      primary_category: 'Mobilität',
    });

    getSearchContext.mockClear();
    await searchLandesverbandChunks({ collectionId: 'hamburg-system', query: 'x' });
    expect(getSearchContext.mock.calls[0]?.[0]).not.toHaveProperty('requestFilters');
  });

  it('verträgt eine leere Rückgabe des Abrufs', async () => {
    getSearchContext.mockResolvedValue(null);
    expect(await searchLandesverbandChunks({ collectionId: 'hamburg-system', query: 'x' })).toEqual(
      []
    );
  });
});

describe('resolveLandesverband', () => {
  it('trennt „nicht erlaubt" (403) von „gibt es nicht" (404)', () => {
    expect(resolveLandesverband(['HH'], 'BY')).toMatchObject({ ok: false, status: 403 });
    expect(resolveLandesverband('*', 'XX')).toMatchObject({ ok: false, status: 404 });
    expect(resolveLandesverband(['HH'], 'HH')).toEqual({
      ok: true,
      collectionId: 'hamburg-system',
    });
  });

  it('lehnt einen Schlüssel ohne Landesverbands-Freigabe ab', () => {
    expect(resolveLandesverband(undefined, 'HH')).toMatchObject({ ok: false, status: 403 });
    expect(resolveLandesverband([], 'HH')).toMatchObject({ ok: false, status: 403 });
  });
});

describe('listAllowedLandesverbaende', () => {
  it('filtert auf die Freigabe des Schlüssels', () => {
    expect(listAllowedLandesverbaende(['BY']).map((lv) => lv.code)).toEqual(['BY']);
    expect(listAllowedLandesverbaende('*')).toHaveLength(2);
    expect(listAllowedLandesverbaende(undefined)).toEqual([]);
  });
});
