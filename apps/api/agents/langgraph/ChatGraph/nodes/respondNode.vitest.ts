import { describe, it, expect, vi } from 'vitest';

import { formatResearchWrapperContext, formatSearchContext } from './respondNode.js';

import type { ChatGraphState, ResearchToolResult, SearchResult } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeResults(n: number): SearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    source: `gruenerator:test-${i}`,
    title: `Result ${i}`,
    content: `Content for result ${i}`.repeat(5),
    relevance: 0.8,
  }));
}

function makeMeta(overrides: Partial<ResearchToolResult> = {}): ResearchToolResult {
  return {
    answer:
      'Moritz Wächter ist eine in Deutschland tätige Fachkraft im Bereich Digitalisierung und Technologie, die bei Strategy& aktiv ist.',
    citations: [
      { id: '1', title: 'Strategy& Profile', url: 'https://example.com/a', snippet: 'snippet a' },
      { id: '2', title: 'PwC Press', url: 'https://example.com/b', snippet: 'snippet b' },
    ] as ResearchToolResult['citations'],
    confidence: 'high',
    searchSteps: [{ tool: 'linkup', query: 'wer ist moritz wächter', resultsCount: 8 }],
    followUpQuestions: ['Welche Projekte hat er bei Strategy& geleitet?'],
    ...overrides,
  };
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'research',
    searchResults: makeResults(4),
    searchQuery: 'wer ist moritz wächter',
    researchBrief: null,
    researchMeta: null,
    documentSources: [],
    perSourceResults: {},
    documentChatIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    searchSources: ['web'],
    complexity: 'simple',
    aiWorkerPool: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('formatResearchWrapperContext', () => {
  it('emits the wrapper directive block and never instructs the model to claim "no results"', () => {
    const out = formatResearchWrapperContext(makeMeta());
    expect(out).toContain('RECHERCHE ABGESCHLOSSEN');
    expect(out).toContain('DU BIST WRAPPER');
    expect(out).toContain('Wiederhole NICHT');
    // The whole point of this PR: agent must be told NOT to say "keine ..." when
    // the artifact has a confident answer. If this assertion breaks, someone
    // softened the prompt and re-opened the artifact↔reply drift bug.
    expect(out).toMatch(/Sage NIE.+keine Informationen/);
  });

  it('includes confidence and citation count for the model to ground its wrapper on', () => {
    const out = formatResearchWrapperContext(makeMeta({ confidence: 'medium' }));
    expect(out).toContain('Konfidenz: medium');
    expect(out).toContain('2 Quellen');
  });

  it('truncates the synthesis preview at 800 chars with an ellipsis', () => {
    const long = 'x'.repeat(1500);
    const out = formatResearchWrapperContext(makeMeta({ answer: long }));
    expect(out).toContain('…');
    // Ensures we don't dump the entire synthesis (which the model would then echo)
    expect(out.length).toBeLessThan(2000);
  });
});

describe('formatSearchContext routing', () => {
  it('routes to wrapper-mode when research intent + high-confidence synthesis is present', async () => {
    const state = makeState({ researchMeta: makeMeta({ confidence: 'high' }) });
    const out = await formatSearchContext(state);
    expect(out).toContain('RECHERCHE ABGESCHLOSSEN');
    expect(out).not.toContain('## SUCHERGEBNISSE');
  });

  it('routes to wrapper-mode when confidence is medium', async () => {
    const state = makeState({ researchMeta: makeMeta({ confidence: 'medium' }) });
    const out = await formatSearchContext(state);
    expect(out).toContain('RECHERCHE ABGESCHLOSSEN');
  });

  it('falls through to chunk-based formatting when researchMeta is null', async () => {
    const state = makeState({ researchMeta: null });
    const out = await formatSearchContext(state);
    expect(out).toContain('## SUCHERGEBNISSE');
    expect(out).not.toContain('RECHERCHE ABGESCHLOSSEN');
  });

  it('falls through to chunk-based formatting when confidence is low', async () => {
    const state = makeState({ researchMeta: makeMeta({ confidence: 'low' }) });
    const out = await formatSearchContext(state);
    expect(out).toContain('## SUCHERGEBNISSE');
    expect(out).not.toContain('RECHERCHE ABGESCHLOSSEN');
  });

  it('falls through to chunk-based formatting when intent is not research (e.g. search)', async () => {
    const state = makeState({
      intent: 'search',
      researchMeta: makeMeta({ confidence: 'high' }),
    });
    const out = await formatSearchContext(state);
    expect(out).toContain('## SUCHERGEBNISSE');
    expect(out).not.toContain('RECHERCHE ABGESCHLOSSEN');
  });

  it('returns empty string when neither wrapper-mode applies nor any search results exist', async () => {
    const state = makeState({ researchMeta: null, searchResults: [] });
    const out = await formatSearchContext(state);
    expect(out).toBe('');
  });
});
