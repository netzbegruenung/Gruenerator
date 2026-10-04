import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateContentHash } from '../../../../utils/validation/hash.js';

import type { DipParent } from './builders.js';

const writeParent = vi.fn(async (_client: unknown, parent: DipParent) => parent.units.length);
const scrollDocuments = vi.fn();
const clientScroll = vi.fn();
const forEachPage = vi.fn();

vi.mock('../../../../config/env.js', () => ({ env: { DIP_API_KEY: 'test-key' } }));
vi.mock('../../../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({ init: async () => {}, client: { scroll: clientScroll } }),
}));
vi.mock('../../../../database/services/QdrantService/operations/batchOperations.js', () => ({
  scrollDocuments: (...args: unknown[]) => scrollDocuments(...args),
}));
vi.mock('../../../mistral/index.js', () => ({
  mistralEmbeddingService: { init: async () => {} },
}));
vi.mock('./store.js', () => ({
  DIP_COLLECTION: 'bundestag_dip_documents',
  writeParent: (client: unknown, parent: DipParent) => writeParent(client, parent),
}));
vi.mock('./dipClient.js', () => ({
  DipClient: class {
    forEachPage = forEachPage;
  },
}));

const { BundestagDipScraper } = await import('./BundestagDipScraper.js');

const DAY = 86_400_000;
const PROTOCOL_TEXT = `
Präsidentin Julia Klöckner:
Das Wort hat Katharina Dröge.

Katharina Dröge (BÜNDNIS 90/DIE GRÜNEN):
Frau Präsidentin! Liebe Kolleginnen und Kollegen! Wir brauchen mehr Klimaschutz.
`;

function protokoll(id: string, text = PROTOCOL_TEXT) {
  return {
    id,
    dokumentnummer: '21/90',
    wahlperiode: 21,
    herausgeber: 'BT',
    datum: '2026-07-10',
    text,
  };
}

/** DIP liefert die Protokolle nur einmal (WP 21), Drucksachen gar nicht. */
function dipReturns(docs: unknown[]) {
  forEachPage.mockImplementation(
    async (
      endpoint: string,
      params: Record<string, unknown>,
      onPage: (d: unknown[]) => Promise<void>
    ) => {
      if (endpoint === 'plenarprotokoll-text' && params['f.wahlperiode'] === 21) await onPage(docs);
    }
  );
}

/** Was Qdrant zu einem `parent_id` kennt: Hash, `null` (importiert) oder nichts. */
function stored(state: Record<string, string | null>) {
  scrollDocuments.mockImplementation(async (_c: unknown, _col: string, filter: QdrantLike) => {
    const parentId = filter.must[0].match.value;
    return parentId in state ? [{ id: 1, payload: { content_hash: state[parentId] } }] : [];
  });
}
interface QdrantLike {
  must: Array<{ match: { value: string } }>;
}

function windowStartOf(callIndex = 0): number {
  return Date.parse(forEachPage.mock.calls[callIndex][1]['f.aktualisiert.start'] as string);
}

describe('BundestagDipScraper', () => {
  let scraper: InstanceType<typeof BundestagDipScraper>;

  beforeEach(async () => {
    vi.clearAllMocks();
    clientScroll.mockResolvedValue({ points: [] });
    scraper = new BundestagDipScraper();
    await scraper.init();
  });

  it('überspringt ein Dokument mit unverändertem Volltext', async () => {
    stored({ 'protokoll:1': generateContentHash(PROTOCOL_TEXT) });
    dipReturns([protokoll('1')]);

    const summary = await scraper.scrapeAllSources({});
    expect(summary).toMatchObject({ stored: 0, updated: 0, skipped: 1 });
    expect(writeParent).not.toHaveBeenCalled();
  });

  it('liest ein importiertes Dokument ohne Hash genau einmal neu', async () => {
    stored({ 'protokoll:1': null });
    dipReturns([protokoll('1')]);

    const summary = await scraper.scrapeAllSources({});
    expect(summary).toMatchObject({ updated: 1, skipped: 0 });
    const parent = writeParent.mock.calls[0][1];
    expect(parent.contentHash).toBe(generateContentHash(PROTOCOL_TEXT));
    expect(parent.units.map((u) => u.speaker)).toEqual(['Katharina Dröge']);
  });

  it('fragt mindestens die letzten drei Tage ab', async () => {
    stored({});
    dipReturns([]);
    clientScroll.mockResolvedValue({
      points: [{ payload: { indexed_at: new Date(Date.now() - 3_600_000).toISOString() } }],
    });
    await scraper.scrapeAllSources({});
    expect(Date.now() - windowStartOf()).toBeGreaterThanOrEqual(3 * DAY - 1000);
  });

  it('holt nach einem Ausfall die ganze Lücke seit dem letzten Schreiben nach', async () => {
    stored({});
    dipReturns([]);
    const lastWrite = Date.now() - 10 * DAY;
    clientScroll.mockResolvedValue({
      points: [{ payload: { indexed_at: new Date(lastWrite).toISOString() } }],
    });
    await scraper.scrapeAllSources({});
    expect(windowStartOf()).toBe(lastWrite - DAY);
  });

  it('lässt mit --force das Fenster weg', async () => {
    stored({});
    dipReturns([]);
    await scraper.scrapeAllSources({ forceUpdate: true });
    expect(forEachPage.mock.calls[0][1]).not.toHaveProperty('f.aktualisiert.start');
  });

  it('zählt im Probelauf, ohne zu schreiben', async () => {
    stored({});
    dipReturns([protokoll('2')]);

    const summary = await scraper.scrapeAllSources({ dryRun: true });
    expect(summary).toMatchObject({ stored: 1 });
    expect(writeParent).not.toHaveBeenCalled();
  });

  it('lässt Bundesrats-Protokolle aus', async () => {
    stored({});
    dipReturns([{ ...protokoll('3'), herausgeber: 'BR' }]);

    const summary = await scraper.scrapeAllSources({});
    expect(summary).toMatchObject({ stored: 0, updated: 0, skipped: 0 });
  });
});
