import { describe, it, expect, vi } from 'vitest';

import {
  formatResearchWrapperContext,
  formatSearchContext,
  formatTabularComputeGuidance,
  getModeGuidance,
} from './respondNode.js';

import type { ChatGraphState, ComputeData, ResearchToolResult, SearchResult } from '../types.js';

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
    // Default to a run_python-capable client (web) so the pandas-guidance
    // assertions below exercise the historical behavior; capability-less
    // clients (mobile/voice) are covered explicitly.
    clientCanRunPython: true,
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

function makeComputeResult(overrides: Partial<ComputeData> = {}): ComputeData {
  return {
    operation: 'Zeichen zählen',
    entries: [
      { label: 'Zeichen (inkl. Leerzeichen)', value: '591' },
      { label: 'Wörter (durch Leerzeichen getrennt)', value: '100' },
    ],
    summary: '591 Zeichen (inkl. Leerzeichen), 100 Wörter, 1 Zeile.',
    ...overrides,
  };
}

describe('getModeGuidance for compute intent', () => {
  it('when a result exists: tells the model to answer conversationally and NEVER ask the user for it', () => {
    const out = getModeGuidance(
      makeState({ intent: 'compute', computedResult: makeComputeResult() })
    );
    // The prose is the real answer, not a stub next to the card.
    expect(out).toContain('Beantworte die konkrete Frage');
    expect(out).toContain('Verneine NICHT');
    expect(out).toContain('bitte NIEMALS um das Ergebnis');
    // Regression guard: the fallback "ask for precision" wording must NOT leak
    // into the prompt when a number is already available — that clause is what
    // made the model deny "591 Zeichen" while the card showed it.
    expect(out).not.toContain('bitte um eine Präzisierung');
  });

  it('when no result exists: uses the fallback that asks for precision, without an anti-denial line', () => {
    const out = getModeGuidance(makeState({ intent: 'compute', computedResult: null }));
    expect(out).toContain('bitte um eine Präzisierung');
    expect(out).not.toContain('Verneine NICHT');
  });
});

describe('getModeGuidance for chart intent', () => {
  it('grounds the chart on the computed values when a fresh result exists', () => {
    const out = getModeGuidance(
      makeState({
        intent: 'chart',
        computedResult: makeComputeResult(),
        computedResultFresh: true,
      })
    );
    expect(out).toContain('AUSSCHLIESSLICH');
    expect(out).not.toContain('plausible Daten');
  });

  it('falls back to the plausible-data guidance without a fresh result', () => {
    const out = getModeGuidance(makeState({ intent: 'chart', computedResult: null }));
    expect(out).toContain('plausible Daten');
    expect(out).not.toContain('AUSSCHLIESSLICH');
  });
});

describe('formatTabularComputeGuidance', () => {
  it('returns nothing without a tabular attachment', () => {
    const out = formatTabularComputeGuidance(makeState({ hasTabularAttachment: false }));
    expect(out).toBe('');
  });

  it('emits the code-block guidance for a tabular attachment without a result', () => {
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: null })
    );
    expect(out).toContain('```python');
    expect(out).toContain('automatisch ausgeführt');
  });

  it('suppresses code emission when a FRESH result exists (run-then-answer resume)', () => {
    const out = formatTabularComputeGuidance(
      makeState({
        hasTabularAttachment: true,
        computedResult: makeComputeResult(),
        computedResultFresh: true,
      })
    );
    expect(out).toContain('ERGEBNIS LIEGT BEREITS VOR');
    expect(out).toContain('KEINEN Code-Block');
    expect(out).not.toContain('```python');
  });

  it('keeps the code-block guidance when the result is only forwarded from the last turn', () => {
    // A stale lastComputeStore result must not block a NEW follow-up
    // computation (e.g. on clients without the run_python capability).
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: makeComputeResult() })
    );
    expect(out).toContain('```python');
  });

  it('never promises code execution to clients without the run_python capability', () => {
    // Mobile/voice: a python block would render but never run — the model must
    // derive the answer from the document context instead.
    const out = formatTabularComputeGuidance(
      makeState({ hasTabularAttachment: true, computedResult: null, clientCanRunPython: false })
    );
    expect(out).toContain('KEIN Python-Interpreter');
    expect(out).not.toContain('```python');
    // The pandas guidance PROMISES execution ("wird **automatisch ausgeführt**");
    // the no-capability variant only forbids claiming it.
    expect(out).not.toContain('**automatisch ausgeführt**');
    expect(out).toContain('NIEMALS, dass Code automatisch ausgeführt wird');
  });

  it('still suppresses recomputation for a fresh result on capability-less clients', () => {
    // The server-side compute intent also sets computedResultFresh — that
    // branch is correct for every client and must win over the capability fork.
    const out = formatTabularComputeGuidance(
      makeState({
        hasTabularAttachment: true,
        computedResult: makeComputeResult(),
        computedResultFresh: true,
        clientCanRunPython: false,
      })
    );
    expect(out).toContain('ERGEBNIS LIEGT BEREITS VOR');
    expect(out).not.toContain('```python');
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
