import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { briefGeneratorNode, wantsResearchBrief } = await import('./briefGeneratorNode.js');

import type { ChatGraphState } from '../types.js';

/** The request envelope of call `i`. */
function requestAt(i: number) {
  return (executeProvider.mock.calls[i] as [string, string, Record<string, any>])[2];
}

/** The provider answers with `content` on every attempt. */
function answering(content: string) {
  executeProvider.mockReset();
  executeProvider.mockResolvedValue({ content, success: true, stop_reason: 'stop' });
}

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [],
    intent: 'research',
    secondaryIntent: null,
    complexity: 'complex',
    searchQuery: 'Klimapolitik',
    // Required state fields with defaults
    searchResults: [],
    citations: [],
    response: '',
    threadId: 'test-thread',
    locale: 'de-DE',
    systemCollectionId: null,
    hasTemporal: false,
    platform: null,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    searchSources: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    ...overrides,
  } as unknown as ChatGraphState;
}

beforeEach(() => answering('Generated brief about climate policy.'));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('briefGeneratorNode', () => {
  it('skips when complexity is not complex', async () => {
    const state = makeState({ complexity: 'simple' });
    const result = await briefGeneratorNode(state);
    expect(result).toEqual({});
    expect(executeProvider).not.toHaveBeenCalled();
  });

  it('skips when intent is not research', async () => {
    const state = makeState({ intent: 'search' });
    const result = await briefGeneratorNode(state);
    expect(result).toEqual({});
  });

  it('generates brief for complex research queries', async () => {
    const state = makeState();
    const result = await briefGeneratorNode(state);
    expect(result.researchBrief).toBe('Generated brief about climate policy.');
    expect(executeProvider).toHaveBeenCalledTimes(1);
  });

  it('truncates individual messages to 800 chars in the prompt', async () => {
    const longMessage = 'X'.repeat(2000);
    const state = makeState({
      messages: [
        { role: 'user', content: 'Short question' },
        { role: 'assistant', content: longMessage },
        { role: 'user', content: 'Follow up' },
      ] as any,
    });

    await briefGeneratorNode(state);

    // Inspect the user message sent to the LLM
    const call = [requestAt(0)];
    const promptContent = call[0].messages[0].content as string;

    // The long message should be truncated to 800 chars
    expect(promptContent).toContain('X'.repeat(800));
    expect(promptContent).not.toContain('X'.repeat(801));
  });

  it('only includes last 5 messages', async () => {
    // Create 8 messages (alternating user/assistant)
    const messages = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message-${i + 1}`,
    }));

    const state = makeState({ messages: messages as any });
    await briefGeneratorNode(state);

    const call = [requestAt(0)];
    const promptContent = call[0].messages[0].content as string;

    // Only last 5 messages should appear (messages 4-8)
    expect(promptContent).not.toContain('Message-1');
    expect(promptContent).not.toContain('Message-3');
    expect(promptContent).toContain('Message-4');
    expect(promptContent).toContain('Message-8');
  });

  it('worst case: 5 messages x 800 chars stays under 5000 chars in prompt', async () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'Y'.repeat(2000), // each well over 800
    }));

    const state = makeState({ messages: messages as any });
    await briefGeneratorNode(state);

    const call = [requestAt(0)];
    const promptContent = call[0].messages[0].content as string;

    // 5 * 800 = 4000 chars of message content + role labels + template text
    // Should be well under 5000 chars total
    expect(promptContent.length).toBeLessThan(5000);
  });

  it('flags briefGenerationFailed and records error when LLM returns empty', async () => {
    // Nur Leerraum: eine WIRKLICH leere Antwort kommt hier gar nicht mehr an —
    // die Kette wertet sie als Ausfall und wirft (siehe Test darunter). Was
    // diesen Zweig noch erreicht, ist eine Antwort, die erst nach dem Trimmen
    // leer ist.
    answering('   ');

    const result = await briefGeneratorNode(makeState());
    expect(result.briefGenerationFailed).toBe(true);
    expect(result.researchBrief).toBeUndefined();
    expect(result.searchErrors).toEqual([
      { source: 'briefGenerator', message: 'empty LLM response' },
    ]);
  });

  it('flags briefGenerationFailed and records error on LLM rejection', async () => {
    executeProvider.mockReset();
    executeProvider.mockRejectedValue(new Error('LLM timeout'));

    const result = await briefGeneratorNode(makeState());
    expect(result.briefGenerationFailed).toBe(true);
    expect(result.researchBrief).toBeUndefined();
    // Die Fassade wirft, nachdem die ganze Kette durch ist; die Meldung nennt
    // Lane und Ursache statt nur der Ursache.
    expect(result.searchErrors).toEqual([
      { source: 'briefGenerator', message: expect.stringContaining('LLM timeout') },
    ]);
  });

  it('truncates generated brief to MAX_BRIEF_LENGTH (500)', async () => {
    const longBrief = 'Z'.repeat(800);
    answering(longBrief);
    const state = makeState();

    const result = await briefGeneratorNode(state);
    expect(result.researchBrief!.length).toBeLessThanOrEqual(500);
  });

  it('includes subQueries in prompt when present', async () => {
    const state = makeState({
      subQueries: ['Windkraft in Bayern', 'Solarenergie Forderungen'],
    });

    await briefGeneratorNode(state);

    const call = [requestAt(0)];
    const promptContent = call[0].messages[0].content as string;

    expect(promptContent).toContain('Teilfragen:');
    expect(promptContent).toContain('Windkraft in Bayern');
    expect(promptContent).toContain('Solarenergie Forderungen');
  });

  it('handles AI SDK parts format in messages', async () => {
    const state = makeState({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part one. ' },
            { type: 'text', text: 'Part two.' },
          ],
        },
        { role: 'user', content: 'Follow up question' },
      ] as any,
    });

    await briefGeneratorNode(state);

    const call = [requestAt(0)];
    const promptContent = call[0].messages[0].content as string;

    expect(promptContent).toContain('Part one. Part two.');
  });
});

/**
 * Die Bedingung stand in drei Fassungen (hier, `searchBranch`,
 * `resumePipeline`) und die dritte war enger als die beiden anderen. Seit sie
 * exportiert ist, gibt es eine — und diese Zusicherungen sagen, welche.
 */
describe('wantsResearchBrief — die eine Fassung der Bedingung', () => {
  it('gilt für research auf complex und moderate', () => {
    expect(wantsResearchBrief(makeState({ complexity: 'complex' }))).toBe(true);
    expect(wantsResearchBrief(makeState({ complexity: 'moderate' }))).toBe(true);
  });

  it('gilt nicht für simple', () => {
    expect(wantsResearchBrief(makeState({ complexity: 'simple' }))).toBe(false);
  });

  it('gilt für keinen anderen Intent der Suchfamilie', () => {
    for (const intent of ['search', 'web', 'agentic', 'compare'] as const) {
      expect(wantsResearchBrief(makeState({ intent, complexity: 'complex' })), intent).toBe(false);
    }
  });
});
