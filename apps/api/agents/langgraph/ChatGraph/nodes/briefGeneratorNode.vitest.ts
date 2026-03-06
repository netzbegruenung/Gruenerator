import { describe, it, expect, vi } from 'vitest';

import { briefGeneratorNode } from './briefGeneratorNode.js';

import type { ChatGraphState } from '../types.js';

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
    complexity: 'complex',
    searchQuery: 'Klimapolitik',
    aiWorkerPool: {
      processRequest: vi
        .fn()
        .mockResolvedValue({ content: 'Generated brief about climate policy.' }),
    },
    // Required state fields with defaults
    searchResults: [],
    citations: [],
    response: '',
    threadId: 'test-thread',
    locale: 'de-DE',
    systemCollectionId: null,
    hasTemporal: false,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    searchSources: [],
    notebookIds: [],
    notebookCollectionIds: [],
    ...overrides,
  } as unknown as ChatGraphState;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('briefGeneratorNode', () => {
  it('skips when complexity is not complex', async () => {
    const state = makeState({ complexity: 'simple' });
    const result = await briefGeneratorNode(state);
    expect(result).toEqual({});
    expect(state.aiWorkerPool.processRequest).not.toHaveBeenCalled();
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
    expect(state.aiWorkerPool.processRequest).toHaveBeenCalledTimes(1);
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
    const call = (state.aiWorkerPool.processRequest as any).mock.calls[0];
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

    const call = (state.aiWorkerPool.processRequest as any).mock.calls[0];
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

    const call = (state.aiWorkerPool.processRequest as any).mock.calls[0];
    const promptContent = call[0].messages[0].content as string;

    // 5 * 800 = 4000 chars of message content + role labels + template text
    // Should be well under 5000 chars total
    expect(promptContent.length).toBeLessThan(5000);
  });

  it('handles empty response from LLM gracefully', async () => {
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockResolvedValue({ content: '' }),
      } as any,
    });

    const result = await briefGeneratorNode(state);
    expect(result).toEqual({});
  });

  it('handles LLM error gracefully', async () => {
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockRejectedValue(new Error('LLM timeout')),
      } as any,
    });

    const result = await briefGeneratorNode(state);
    expect(result).toEqual({});
  });

  it('truncates generated brief to MAX_BRIEF_LENGTH (500)', async () => {
    const longBrief = 'Z'.repeat(800);
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockResolvedValue({ content: longBrief }),
      } as any,
    });

    const result = await briefGeneratorNode(state);
    expect(result.researchBrief!.length).toBeLessThanOrEqual(500);
  });

  it('includes subQueries in prompt when present', async () => {
    const state = makeState({
      subQueries: ['Windkraft in Bayern', 'Solarenergie Forderungen'],
    });

    await briefGeneratorNode(state);

    const call = (state.aiWorkerPool.processRequest as any).mock.calls[0];
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

    const call = (state.aiWorkerPool.processRequest as any).mock.calls[0];
    const promptContent = call[0].messages[0].content as string;

    expect(promptContent).toContain('Part one. Part two.');
  });
});
