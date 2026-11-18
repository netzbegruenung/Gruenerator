import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiDecide = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/ai/decide.js', () => ({ aiDecide }));
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { classifyDocsIntentTiebreak } from './docsIntentTiebreak.js';

const chose = (choice: string) => ({ intent: { choice, confidence: 0.8, probabilities: {} } });

beforeEach(() => aiDecide.mockReset());

describe('classifyDocsIntentTiebreak', () => {
  it.each(['edit', 'question'])('returns the decision model choice %s', async (choice) => {
    aiDecide.mockResolvedValueOnce(chose(choice));
    expect(
      await classifyDocsIntentTiebreak({
        userContent: 'mach das knackiger',
        conversationContext: null,
      })
    ).toBe(choice);
  });

  it('asks one choice question with the message as labelled state and a hard budget', async () => {
    aiDecide.mockResolvedValueOnce(chose('edit'));
    await classifyDocsIntentTiebreak({ userContent: 'polish this', conversationContext: null });
    const call = aiDecide.mock.calls[0]![0] as {
      state: string;
      timeoutMs: number;
      questions: { intent: { criteria: Record<string, string> } };
    };
    expect(call.state).toBe('NACHRICHT IM DOKUMENT-EDITOR:\npolish this');
    expect(call.timeoutMs).toBe(1500);
    expect(Object.keys(call.questions.intent.criteria)).toEqual(['edit', 'question']);
  });

  it('puts the conversation before the message', async () => {
    aiDecide.mockResolvedValueOnce(chose('edit'));
    await classifyDocsIntentTiebreak({
      userContent: 'ja, mach das',
      conversationContext: 'Assistent: Soll ich den zweiten Absatz kürzen?',
    });
    expect((aiDecide.mock.calls[0]![0] as { state: string }).state).toBe(
      'BISHERIGER VERLAUF:\nAssistent: Soll ich den zweiten Absatz kürzen?\n\nNACHRICHT IM DOKUMENT-EDITOR:\nja, mach das'
    );
  });

  it.each([
    ['an error', () => aiDecide.mockRejectedValueOnce(new Error('no decision host answered'))],
    ['an unknown option', () => aiDecide.mockResolvedValueOnce(chose('chat'))],
  ])('returns null on %s', async (_label, arrange) => {
    arrange();
    expect(
      await classifyDocsIntentTiebreak({ userContent: 'weg damit', conversationContext: null })
    ).toBeNull();
  });
});
