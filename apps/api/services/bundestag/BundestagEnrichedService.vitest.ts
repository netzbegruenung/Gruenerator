/**
 * Unit tests for BundestagEnrichedService routing.
 *
 * The service is a deterministic router: document (explicit Drucksache
 * number) → person (extracted name) → topic (default). These tests pin the
 * routing decisions and the graceful degradation (notes, fall-throughs,
 * kind: 'none') with a fully mocked client — no network.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

import type { BtListResult } from './BundestagMCPClient.js';

const { clientMock, extractNameMock } = vi.hoisted(() => ({
  clientMock: {
    findDrucksache: vi.fn(),
    searchVorgaenge: vi.fn(),
    searchPersonenTrimmed: vi.fn(),
    searchAktivitaetenTrimmed: vi.fn(),
    searchSpeeches: vi.fn(),
    semanticSearch: vi.fn(),
  },
  extractNameMock: vi.fn(),
}));

vi.mock('./BundestagMCPClient.js', () => ({
  getBundestagMCPClient: () => clientMock,
}));

vi.mock('./PersonDetectionService.js', () => ({
  getPersonDetectionService: () => ({ extractNameFromQuery: extractNameMock }),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { BundestagEnrichedService } from './BundestagEnrichedService.js';

const empty = <T>(): BtListResult<T> => ({ items: [], wpFallback: false });
const listOf = <T>(...items: T[]): BtListResult<T> => ({ items, wpFallback: false });

const drucksache = (nr: string) => ({
  id: '1',
  titel: 'Entwurf eines Gesetzes',
  dokumentnummer: nr,
  drucksachetyp: 'Gesetzentwurf',
  wahlperiode: 21,
  datum: '2026-03-01',
  urheber: ['Bundesregierung'],
  pdfUrl: null,
});

const person = (name: string) => ({ id: '7', name, fraktion: 'GRÜNE', wahlperiode: 21 });

beforeEach(() => {
  vi.clearAllMocks();
  extractNameMock.mockReturnValue(null);
  clientMock.findDrucksache.mockResolvedValue(empty());
  clientMock.searchVorgaenge.mockResolvedValue(empty());
  clientMock.searchPersonenTrimmed.mockResolvedValue(empty());
  clientMock.searchAktivitaetenTrimmed.mockResolvedValue(empty());
  clientMock.searchSpeeches.mockResolvedValue(empty());
  clientMock.semanticSearch.mockResolvedValue(empty());
});

describe('BundestagEnrichedService — document routing', () => {
  it('routes "Drucksache 21/123" to the document path', async () => {
    clientMock.findDrucksache.mockResolvedValue(listOf(drucksache('21/123')));

    const result = await new BundestagEnrichedService().search('Was steht in Drucksache 21/123?');

    expect(result.kind).toBe('document');
    expect(clientMock.findDrucksache).toHaveBeenCalledWith({ dokumentnummer: '21/123', limit: 5 });
    expect(result.metadata.matchedDokumentnummer).toBe('21/123');
    expect(clientMock.semanticSearch).not.toHaveBeenCalled();
  });

  it('routes a bare "21/123" reference to the document path', async () => {
    clientMock.findDrucksache.mockResolvedValue(listOf(drucksache('21/123')));

    const result = await new BundestagEnrichedService().search('Worum geht es in 21/123?');

    expect(result.kind).toBe('document');
  });

  it.each(['Die Abstimmung ging 3/4 gegen den Antrag aus', 'Was war am 31/12 im Bundestag los?'])(
    'does NOT treat "%s" as a Drucksache reference',
    async (query) => {
      const result = await new BundestagEnrichedService().search(query);

      // The topic fallback may query by title, but never by dokumentnummer.
      expect(clientMock.findDrucksache).not.toHaveBeenCalledWith(
        expect.objectContaining({ dokumentnummer: expect.any(String) })
      );
      expect(result.metadata.matchedDokumentnummer).toBeNull();
    }
  );

  it('adds a sibling note and fetches the Vorgang for the found document', async () => {
    clientMock.findDrucksache.mockResolvedValue(
      listOf(drucksache('21/123'), drucksache('21/123'), drucksache('21/123'))
    );
    clientMock.searchVorgaenge.mockResolvedValue(
      listOf({
        id: '9',
        titel: 'Gesetzgebungsverfahren',
        vorgangstyp: 'Gesetzgebung',
        beratungsstand: 'Überwiesen',
        datum: '2026-03-05',
      })
    );

    const result = await new BundestagEnrichedService().search('Drucksache 21/123');

    expect(result.document?.vorgang?.beratungsstand).toBe('Überwiesen');
    expect(result.document?.siblings).toHaveLength(2);
    expect(result.notes.some((n) => n.includes('2 weitere Dokumente'))).toBe(true);
  });

  it('falls through to the topic path with a note when the Drucksache is not found', async () => {
    clientMock.semanticSearch.mockResolvedValue(
      listOf({
        docType: 'vorgang',
        docId: '1',
        entityType: null,
        title: 'Treffer',
        abstract: null,
        dokumentnummer: null,
        date: null,
        wahlperiode: 21,
        score: 0.8,
      })
    );

    const result = await new BundestagEnrichedService().search('Was steht in Drucksache 21/9999?');

    expect(result.kind).toBe('topic');
    expect(result.notes.some((n) => n.includes('21/9999'))).toBe(true);
  });
});

describe('BundestagEnrichedService — person routing', () => {
  it('resolves an extracted name and fetches activities + topical speeches in parallel', async () => {
    extractNameMock.mockReturnValue('Katharina Dröge');
    clientMock.searchPersonenTrimmed.mockResolvedValue(listOf(person('Katharina Dröge')));
    clientMock.searchAktivitaetenTrimmed.mockResolvedValue(
      listOf({
        titel: 'Rede zum Klimaschutz',
        typ: 'Rede',
        datum: '2026-05-12',
        dokumentnummer: '21/83',
      })
    );

    const service = new BundestagEnrichedService();
    const result = await service.search(
      'Welche Reden hat Katharina Dröge zum Klimaschutz gehalten?'
    );

    expect(result.kind).toBe('person');
    expect(result.person?.person.name).toBe('Katharina Dröge');
    expect(clientMock.searchAktivitaetenTrimmed).toHaveBeenCalledWith('7', 8);
    expect(clientMock.searchSpeeches).toHaveBeenCalledWith(
      expect.objectContaining({ speaker: 'Katharina Dröge', limit: 3 })
    );
    // Topic extraction strips the name and stopwords, keeping the subject.
    const speechQuery = clientMock.searchSpeeches.mock.calls[0][0].query as string;
    expect(speechQuery).toContain('klimaschutz');
    expect(speechQuery).not.toContain('dröge');
  });

  it('notes additional name matches', async () => {
    extractNameMock.mockReturnValue('Müller');
    clientMock.searchPersonenTrimmed.mockResolvedValue(
      listOf(person('Anna Müller'), person('Bernd Müller'))
    );

    const result = await new BundestagEnrichedService().search('Was macht Müller im Bundestag?');

    expect(result.kind).toBe('person');
    expect(result.notes.some((n) => n.includes('Bernd Müller'))).toBe(true);
  });

  it('rejects implausible name extractions ("Was wurde im") instead of a person lookup', async () => {
    extractNameMock.mockReturnValue('Was wurde im');

    const result = await new BundestagEnrichedService().search(
      'Was wurde im Bundestag zur Kindergrundsicherung debattiert?'
    );

    expect(clientMock.searchPersonenTrimmed).not.toHaveBeenCalled();
    expect(result.metadata.extractedName).toBeNull();
    expect(clientMock.semanticSearch).toHaveBeenCalled(); // went straight to topic
  });

  it('falls through to the topic path with a note when no MP matches the name', async () => {
    extractNameMock.mockReturnValue('Nichtexistent');

    const result = await new BundestagEnrichedService().search('Was sagt Nichtexistent dazu?');

    expect(result.kind).toBe('none');
    expect(result.notes.some((n) => n.includes('Nichtexistent'))).toBe(true);
    expect(clientMock.semanticSearch).toHaveBeenCalled(); // topic path ran
  });
});

describe('BundestagEnrichedService — topic routing', () => {
  it('defaults to the topic path with semantic hits and speeches', async () => {
    clientMock.semanticSearch.mockResolvedValue(
      listOf({
        docType: 'drucksache',
        docId: '2',
        entityType: 'Gesetzentwurf',
        title: 'Wärmeplanungsgesetz',
        abstract: 'Kurzfassung.',
        dokumentnummer: '20/8654',
        date: '2023-10-13',
        wahlperiode: 20,
        score: 0.9,
      })
    );

    const result = await new BundestagEnrichedService().search('Wärmewende im Gebäudesektor');

    expect(result.kind).toBe('topic');
    expect(result.topic?.hits).toHaveLength(1);
    expect(clientMock.searchSpeeches).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
  });

  it('requests more speeches when the query asks for debates/speeches', async () => {
    clientMock.searchSpeeches.mockResolvedValue(
      listOf({
        speaker: 'X',
        party: null,
        date: null,
        excerpt: 'Auszug.',
        protokollNummer: '21/80',
        wahlperiode: 21,
        herausgeber: 'BT',
        topTitle: null,
        score: 1,
      })
    );

    await new BundestagEnrichedService().search('Was wurde im Plenum zur Wärmewende debattiert?');

    expect(clientMock.searchSpeeches).toHaveBeenCalledWith(expect.objectContaining({ limit: 4 }));
  });

  it('surfaces the Wahlperiode fallback as a note', async () => {
    clientMock.semanticSearch.mockResolvedValue({
      items: [
        {
          docType: 'vorgang',
          docId: '3',
          entityType: null,
          title: 'Heizungsgesetz',
          abstract: null,
          dokumentnummer: null,
          date: null,
          wahlperiode: 20,
          score: 0.7,
        },
      ],
      wpFallback: true,
    });

    const result = await new BundestagEnrichedService().search('Heizungsgesetz');

    expect(result.notes.some((n) => n.includes('früheren Wahlperioden'))).toBe(true);
  });

  it('falls back to the DIP title search when the semantic layer is empty', async () => {
    // Vector backend down → semanticSearch/searchSpeeches degrade to empty.
    clientMock.findDrucksache.mockResolvedValue(listOf(drucksache('20/9092')));
    clientMock.searchVorgaenge.mockResolvedValue(
      listOf({
        id: '5',
        titel: 'Einführung einer Kindergrundsicherung',
        vorgangstyp: 'Gesetzgebung',
        beratungsstand: 'Überwiesen',
        datum: '2023-11-08',
      })
    );

    const result = await new BundestagEnrichedService().search('Kindergrundsicherung Einführung');

    expect(result.kind).toBe('topic');
    expect(result.topic?.documents).toHaveLength(1);
    expect(result.topic?.vorgaenge).toHaveLength(1);
    expect(clientMock.findDrucksache).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('kindergrundsicherung') })
    );
    expect(result.notes.some((n) => n.includes('DIP-Titelsuche'))).toBe(true);
  });

  it('returns kind "none" when every source is empty — without throwing', async () => {
    const result = await new BundestagEnrichedService().search('völlig ergebnislose Anfrage');

    expect(result.kind).toBe('none');
    expect(result.metadata.query).toBe('völlig ergebnislose Anfrage');
  });
});
