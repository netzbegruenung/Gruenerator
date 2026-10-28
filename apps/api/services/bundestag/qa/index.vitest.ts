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
vi.mock('../../ai/lanes.js', () => ({ laneTarget: () => ({ model: 'gemma-4-31b-it' }) }));
vi.mock('../../../config/env.js', () => ({ env: { DIP_API_KEY: 'k' } }));
vi.mock('../BundestagMCPClient.js', () => ({ getBundestagMCPClient: () => ({}) }));

import { answerBundestagQuestion, planBundestagQuestion, readBundestagRefs } from './index.js';

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
});
