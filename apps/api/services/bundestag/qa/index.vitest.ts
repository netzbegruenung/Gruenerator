import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  planFilters: vi.fn(),
  findCandidates: vi.fn(),
  resolveRefs: vi.fn(),
  fetchTexts: vi.fn(),
  readDocuments: vi.fn(),
  composeAnswer: vi.fn(),
}));
vi.mock('./plan.js', async (orig) => ({
  ...(await orig<typeof import('./plan.js')>()),
  planFilters: m.planFilters,
}));
vi.mock('./find.js', () => ({ findCandidates: m.findCandidates }));
vi.mock('./fetchTexts.js', () => ({ resolveRefs: m.resolveRefs, fetchTexts: m.fetchTexts }));
vi.mock('./read.js', () => ({ readDocuments: m.readDocuments, splitWindows: () => [] }));
vi.mock('./answer.js', () => ({ composeAnswer: m.composeAnswer }));
const envMock = vi.hoisted(() => ({ DIP_API_KEY: 'k' as string | undefined }));
vi.mock('../../../config/env.js', () => ({ env: envMock }));
vi.mock('../BundestagMCPClient.js', () => ({ getBundestagMCPClient: () => ({}) }));

import {
  answerBundestagQuestion,
  bundestagFamily,
  planBundestagQuestion,
  readBundestagRefs,
  resetDipForTests,
} from './index.js';

const deps = { dip: { list: vi.fn() }, mcp: { semanticSearch: vi.fn() }, redis: null };
const cand = { ref: '21/9', drucksachetyp: 'Antrag', titel: 'T', datum: 'd' };

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.fetchTexts.mockResolvedValue([]);
  m.readDocuments.mockResolvedValue([]);
  m.composeAnswer.mockResolvedValue({ answer: 'x', citations: [], capped: 0, invalidCitations: 0 });
});

describe('Fassade', () => {
  it('refs haben Vorrang: kein Plan, keine Suche, Filter laufen durch', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    const filters = { wahlperiode: [20] };
    const out = await answerBundestagQuestion({
      question: 'Klimaschutzziele der Bundesregierung?',
      refs: ['21/9'],
      filters,
      deps,
    });
    expect(m.planFilters).not.toHaveBeenCalled();
    expect(m.findCandidates).not.toHaveBeenCalled();
    expect(m.resolveRefs).toHaveBeenCalledWith(['21/9'], deps.dip);
    expect(out.filters).toEqual(filters);
    const read = m.readDocuments.mock.calls[0]![0];
    expect(read.keywords).toContain('klimaschutzziele');
  });

  it('ohne refs: plan + find, Filter aus dem Plan', async () => {
    m.planFilters.mockResolvedValue({
      filters: { wahlperiode: [21] },
      keywords: ['a'],
      notes: ['n1'],
      assumedWahlperiode: true,
    });
    m.findCandidates.mockResolvedValue({
      candidates: [cand],
      totals: { vorgaenge: 1, drucksachen: 1 },
      notes: ['n2'],
    });
    const out = await answerBundestagQuestion({ question: 'Frage ohne refs', deps });
    expect(out.filters).toEqual({ wahlperiode: [21] });
    expect(out.notes).toEqual(['n1', 'n2']);
    expect(m.fetchTexts.mock.calls[0]![0]).toEqual([cand]);
  });

  it('plan liefert Filter, Wörter, Notizen und Treffer', async () => {
    m.planFilters.mockResolvedValue({
      filters: {},
      keywords: ['k'],
      notes: ['p'],
      assumedWahlperiode: false,
    });
    m.findCandidates.mockResolvedValue({
      candidates: [],
      totals: { vorgaenge: 0, drucksachen: 0 },
      notes: ['f'],
    });
    const out = await planBundestagQuestion({ question: 'Frage', deps });
    expect(out).toEqual({
      filters: {},
      keywords: ['k'],
      notes: ['p', 'f'],
      totals: { vorgaenge: 0, drucksachen: 0 },
      candidates: [],
    });
  });

  it('readBundestagRefs liest ohne Antworttext', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    const out = await readBundestagRefs({ question: 'Frage', refs: ['21/9', '21/10'], deps });
    expect(m.composeAnswer).not.toHaveBeenCalled();
    expect(out.documents).toEqual([]);
    expect(out.notes[0]).toContain('21/10');
  });

  it('readBundestagRefs reicht Nummer, Datum, Urheber und PDF für den Chat durch', async () => {
    const doc = {
      ref: '21/9',
      dokumentnummer: '21/9',
      drucksachetyp: 'Antrag',
      titel: 'T',
      datum: '2025-10-01',
      urheber: ['SPD'],
      pdfUrl: 'https://dserver.bundestag.de/btd/21/000/2100009.pdf',
      textSource: 'pdf',
    };
    m.resolveRefs.mockResolvedValue([doc]);
    m.readDocuments.mockResolvedValue([
      {
        doc,
        relevant: true,
        points: [{ aussage: 'a', zitat: 'z', method: 'exact' }],
        droppedPoints: 0,
        windowsRead: 1,
        windowsTotal: 1,
        skipped: null,
        charsRead: 10,
        usage: null,
      },
    ]);
    const out = await readBundestagRefs({ question: 'Frage', refs: ['21/9'], deps });
    expect(out.documents[0]).toMatchObject({
      dokumentnummer: '21/9',
      datum: '2025-10-01',
      urheber: ['SPD'],
      pdfUrl: doc.pdfUrl,
    });
  });

  it('refs mit Filtern: Notiz, dass die Filter nicht angewendet wurden', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    const out = await answerBundestagQuestion({
      question: 'Frage',
      refs: ['21/9'],
      filters: { wahlperiode: [20] },
      deps,
    });
    expect(out.notes.join(' ')).toContain('nicht angewendet');
  });

  it('sammelt charsRead aus den Leseergebnissen', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    m.readDocuments.mockResolvedValue([
      {
        doc: cand,
        relevant: false,
        points: [],
        droppedPoints: 0,
        windowsRead: 1,
        windowsTotal: 1,
        skipped: null,
        charsRead: 70,
        usage: null,
      },
      {
        doc: cand,
        relevant: false,
        points: [],
        droppedPoints: 0,
        windowsRead: 1,
        windowsTotal: 1,
        skipped: null,
        charsRead: 30,
        usage: null,
      },
    ]);
    const out = await answerBundestagQuestion({ question: 'Frage', refs: ['21/9'], deps });
    expect(out.stats.charsRead).toBe(100);
  });

  it('readBundestagRefs reicht das Abbruchsignal des Werkzeugs an Holen und Lesen weiter', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    const ctrl = new AbortController();
    await readBundestagRefs({ question: 'Frage', refs: ['21/9'], deps, abortSignal: ctrl.signal });
    const fetchSignal = m.fetchTexts.mock.calls[0]![1].signal as AbortSignal;
    const readSignal = m.readDocuments.mock.calls[0]![0].signal as AbortSignal;
    expect(fetchSignal.aborted).toBe(false);
    ctrl.abort();
    expect(fetchSignal.aborted).toBe(true);
    expect(readSignal.aborted).toBe(true);
  });

  it('Endpunkt: Frist ab Anfragebeginn für das Lesen, Restzeit für die Antwort', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    const before = Date.now();
    await answerBundestagQuestion({ question: 'Frage', refs: ['21/9'], deps });
    const read = m.readDocuments.mock.calls[0]![0];
    expect(read.deadlineAt).toBeGreaterThanOrEqual(before + 150_000);
    expect(read.deadlineAt).toBeLessThanOrEqual(Date.now() + 150_000);
    const answer = m.composeAnswer.mock.calls[0]![0];
    expect(answer.timeoutMs).toBeGreaterThanOrEqual(15_000);
  });

  it('wirft klar, wenn DIP_API_KEY fehlt', async () => {
    envMock.DIP_API_KEY = undefined;
    resetDipForTests();
    try {
      await expect(answerBundestagQuestion({ question: 'Frage', refs: ['21/9'] })).rejects.toThrow(
        'DIP_API_KEY is not set'
      );
    } finally {
      envMock.DIP_API_KEY = 'k';
    }
  });
});

describe('bundestagFamily', () => {
  it('sucht über die Nummer mit Beratungen und lässt mehr als sechs Dokumente zu', async () => {
    m.findCandidates.mockResolvedValue({ candidates: [cand], totals: {}, notes: [] });
    const out = await bundestagFamily('21/3546', deps as never);
    const call = m.findCandidates.mock.calls[0]![0];
    expect(call.filters).toEqual({
      dokumentnummer: ['21/3546'],
      mitBeratung: true,
      wahlperiode: [21],
    });
    expect(call.assumedWahlperiode).toBe(false);
    expect(call.budget.maxDocuments).toBeGreaterThan(6);
    expect(out.candidates).toEqual([cand]);
  });
});

describe('readBundestagRefs: fokus', () => {
  it('reicht den Fokus an die Lesestufe und meldet, ob er gefunden wurde', async () => {
    m.resolveRefs.mockResolvedValue([cand]);
    m.readDocuments.mockResolvedValue([
      {
        doc: { ...cand, dokumentnummer: '21/9', urheber: [], pdfUrl: null, textSource: 'dip' },
        relevant: false,
        points: [],
        droppedPoints: 0,
        windowsRead: 1,
        windowsTotal: 1,
        skipped: null,
        fokusFound: false,
        charsRead: 1,
        usage: null,
      },
    ]);
    const out = await readBundestagRefs({
      question: 'Was steht in Artikel 3?',
      refs: ['21/9'],
      fokus: 'Artikel 3',
      deps: deps as never,
    });
    expect(m.readDocuments.mock.calls[0]![0].fokus).toBe('Artikel 3');
    expect(out.documents[0]!.fokusGefunden).toBe(false);
  });
});
