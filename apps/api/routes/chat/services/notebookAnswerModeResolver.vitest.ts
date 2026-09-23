import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiText = vi.fn(async (..._args: unknown[]): Promise<string> => 'chat');
vi.mock('../../../services/ai/generate.js', () => ({
  aiText: (...args: unknown[]) => aiText(...args),
}));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { createDecisionJournal, runWithDecisionJournal } from '../../../utils/decisionJournal.js';

import {
  formatGuardPrompt,
  isPraezisionEligible,
  notebookGuardHistory,
  parseGuardVerdict,
  resolveNotebookAnswerMode,
  type NotebookAnswerModeInput,
} from './notebookAnswerModeResolver.js';

const USER_NB = '0b1c29c9-9823-4794-b1be-70a36f801791';
const NO_CONTEXT = { question: 'Was steht zum Klimaschutz drin?', history: [] };

beforeEach(() => {
  aiText.mockReset();
  aiText.mockResolvedValue('chat');
});

describe('resolveNotebookAnswerMode', () => {
  it('runs chat when the request names no mode', async () => {
    expect(
      await resolveNotebookAnswerMode({
        requested: null,
        collectionIds: [USER_NB],
        userLocale: null,
        ...NO_CONTEXT,
      })
    ).toEqual({
      decision: { requested: null, resolved: 'chat', reason: 'default' },
      warning: null,
    });
  });

  it('runs chat when chat was asked for', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'chat',
      collectionIds: [USER_NB],
      userLocale: 'de-DE',
      ...NO_CONTEXT,
    });
    expect(out.decision).toEqual({ requested: 'chat', resolved: 'chat', reason: 'explicit' });
  });

  it('runs precision when asked for on a user notebook', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'praezision',
      collectionIds: [USER_NB],
      userLocale: 'de-DE',
      ...NO_CONTEXT,
    });
    expect(out).toEqual({
      decision: { requested: 'praezision', resolved: 'praezision', reason: 'explicit' },
      warning: null,
    });
  });

  it('falls back to chat with a warning when no notebook is readable', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'praezision',
      collectionIds: ['oesterreich-notebook'],
      userLocale: 'de-DE',
      ...NO_CONTEXT,
    });
    expect(out).toEqual({
      decision: { requested: 'praezision', resolved: 'chat', reason: 'ineligible' },
      warning: 'notebook_praezision_unavailable',
    });
  });

  it('marks auto on an unreadable page as ineligible, without a warning', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'auto',
      collectionIds: [],
      userLocale: 'de-DE',
      ...NO_CONTEXT,
    });
    expect(out).toEqual({
      decision: { requested: 'auto', resolved: 'chat', reason: 'ineligible' },
      warning: null,
    });
  });
});

function auto(question: string, history: NotebookAnswerModeInput['history'] = []) {
  return resolveNotebookAnswerMode({
    requested: 'auto',
    collectionIds: [USER_NB],
    userLocale: 'de-DE',
    question,
    history,
  });
}

describe('resolveNotebookAnswerMode — auto', () => {
  it('takes a tool ask straight to precision without asking the model', async () => {
    const out = await auto('Liste alle Quellen auf, die neueste zuerst.');
    expect(out).toEqual({
      decision: { requested: 'auto', resolved: 'praezision', reason: 'pregate' },
      warning: null,
    });
    expect(aiText).not.toHaveBeenCalled();
  });

  it('hands a write ask to the guard instead of the pregate', async () => {
    const out = await auto('Entferne die alte Pressemitteilung aus dem Notebook');
    expect(aiText).toHaveBeenCalledTimes(1);
    expect(out.decision).toEqual({ requested: 'auto', resolved: 'chat', reason: 'guard' });
  });

  it('follows the guard verdict', async () => {
    aiText.mockResolvedValueOnce('praezision');
    expect((await auto('Prüf, ob das Zitat so drinsteht.')).decision).toEqual({
      requested: 'auto',
      resolved: 'praezision',
      reason: 'guard',
    });
    expect((await auto('Was fordern die Quellen zum Klimaschutz?')).decision).toEqual({
      requested: 'auto',
      resolved: 'chat',
      reason: 'guard',
    });
  });

  it('asks the model on the classification lane with a hard budget', async () => {
    await auto('Was fordern die Quellen zum Klimaschutz?');
    expect(aiText.mock.calls[0]![0]).toMatchObject({
      lane: 'chat_intent_classification',
      pinned: 'standard',
      maxOutputTokens: 16,
      temperature: 0,
      prompt: 'Letzte Nachricht: "Was fordern die Quellen zum Klimaschutz?"',
    });
  });

  it.each([
    ['an error', () => aiText.mockRejectedValueOnce(new Error('provider down'))],
    ['garbage', () => aiText.mockResolvedValueOnce('weiss nicht')],
    ['an empty answer', () => aiText.mockResolvedValueOnce('')],
  ])('falls back to chat on %s', async (_label, arrange) => {
    arrange();
    expect((await auto('Was fordern die Quellen zum Klimaschutz?')).decision).toEqual({
      requested: 'auto',
      resolved: 'chat',
      reason: 'guard_fallback',
    });
  });

  it('falls back to chat when the guard times out', async () => {
    vi.useFakeTimers();
    try {
      aiText.mockReturnValueOnce(new Promise<string>(() => {}));
      const pending = auto('Was fordern die Quellen zum Klimaschutz?');
      await vi.advanceTimersByTimeAsync(1500);
      expect((await pending).decision.reason).toBe('guard_fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not ask the model about an empty question', async () => {
    expect((await auto('   ')).decision.reason).toBe('guard_fallback');
    expect(aiText).not.toHaveBeenCalled();
  });

  it('gives the guard the previous exchange with its mode', async () => {
    aiText.mockResolvedValueOnce('praezision');
    await auto('Und die zweite davon?', [
      { role: 'user', content: 'Liste die neuesten Quellen auf.', answerMode: null },
      { role: 'assistant', content: '1. A\n2. B', answerMode: 'praezision' },
    ]);
    const prompt = (aiText.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain('Nutzer*in: Liste die neuesten Quellen auf.');
    expect(prompt).toContain('Antwort (Modus: praezision): 1. A');
    expect(prompt).toMatch(/Letzte Nachricht: "Und die zweite davon\?"$/);
  });
});

describe('resolveNotebookAnswerMode — decision journal', () => {
  it.each([
    [{ requested: null }, 'default'],
    [{ requested: 'chat' as const }, 'explicit_chat'],
    [{ requested: 'praezision' as const }, 'explicit_praezision'],
    [{ requested: 'praezision' as const, collectionIds: [] }, 'ineligible'],
    [{ requested: 'auto' as const, question: 'Wie viele Quellen liegen hier?' }, 'pregate'],
    [{ requested: 'auto' as const }, 'guard_chat'],
  ])('records %j as %s', async (overrides, branch) => {
    const journal = createDecisionJournal();
    await runWithDecisionJournal(journal, () =>
      resolveNotebookAnswerMode({
        requested: null,
        collectionIds: [USER_NB],
        userLocale: 'de-DE',
        ...NO_CONTEXT,
        ...overrides,
      })
    );
    expect(journal.entries.map((e) => [e.point, e.chose])).toEqual([
      ['notebook.answer_mode', branch],
    ]);
  });

  it('records the guard verdicts and the fallback', async () => {
    const run = async () => {
      const journal = createDecisionJournal();
      await runWithDecisionJournal(journal, () => auto('Was fordern die Quellen?'));
      return journal.entries[0]!.chose;
    };
    aiText.mockResolvedValueOnce('praezision');
    expect(await run()).toBe('guard_praezision');
    aiText.mockRejectedValueOnce(new Error('down'));
    expect(await run()).toBe('guard_fallback');
  });
});

describe('parseGuardVerdict', () => {
  it.each([
    ['chat', 'chat'],
    ['praezision', 'praezision'],
    ['Präzision.', 'praezision'],
    ['PRÄZISION', 'praezision'],
    ['praez', 'praezision'],
    ['"chat"', 'chat'],
    ['  Chat\n', 'chat'],
    ['chat oder praezision', 'chat'],
    ['praezision, nicht chat', 'praezision'],
    ['Antwort: präzision', 'praezision'],
  ])('%j → %s', (raw, verdict) => {
    expect(parseGuardVerdict(raw)).toBe(verdict);
  });

  it.each([[''], ['weiss nicht'], ['edit']])('%j → null', (raw) => {
    expect(parseGuardVerdict(raw)).toBeNull();
  });
});

describe('notebookGuardHistory', () => {
  it('keeps the last two exchanges before the question, with the answer modes', () => {
    const history = notebookGuardHistory([
      { role: 'user', content: 'F1' },
      { role: 'assistant', content: 'A1', answerMode: 'chat' },
      { role: 'user', content: 'F2' },
      { role: 'assistant', content: [{ type: 'text', text: 'A2' }], answerMode: 'praezision' },
      { role: 'user', content: 'F3' },
      { role: 'assistant', content: 'A3', answerMode: 'auto' },
      { role: 'user', content: 'Frage jetzt' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'F2', answerMode: null },
      { role: 'assistant', content: 'A2', answerMode: 'praezision' },
      { role: 'user', content: 'F3', answerMode: null },
      { role: 'assistant', content: 'A3', answerMode: null },
    ]);
  });

  it('is empty for a first question and skips system and empty entries', () => {
    expect(notebookGuardHistory([{ role: 'user', content: 'Frage' }])).toEqual([]);
    expect(
      notebookGuardHistory([
        { role: 'system', content: 'x' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Frage' },
      ])
    ).toEqual([]);
  });
});

describe('formatGuardPrompt', () => {
  it('cuts long answers to 300 characters', () => {
    const prompt = formatGuardPrompt('Und weiter?', [
      { role: 'assistant', content: 'x'.repeat(400), answerMode: 'chat' },
    ]);
    expect(prompt).toContain(`Antwort (Modus: chat): ${'x'.repeat(300)}…\n`);
    expect(prompt).not.toContain('x'.repeat(301));
  });

  it('leaves out the mode of an answer that carries none', () => {
    expect(
      formatGuardPrompt('Und?', [{ role: 'assistant', content: 'A', answerMode: null }])
    ).toContain('Antwort: A');
  });
});

describe('isPraezisionEligible', () => {
  it('accepts user notebooks and single system collections of the locale', () => {
    expect(isPraezisionEligible([USER_NB], 'de-DE')).toBe(true);
    expect(isPraezisionEligible(['hamburg-notebook'], 'de-DE')).toBe(true);
    expect(isPraezisionEligible(['oesterreich-notebook'], 'de-AT')).toBe(true);
  });

  it('refuses another locale, a multi-collection slug and an empty page', () => {
    expect(isPraezisionEligible(['oesterreich-notebook'], 'de-DE')).toBe(false);
    expect(isPraezisionEligible(['gruenerator-notebook'], 'de-DE')).toBe(false);
    expect(isPraezisionEligible([], 'de-DE')).toBe(false);
  });

  it('is enough when one notebook of the page is readable', () => {
    expect(isPraezisionEligible(['gruenerator-notebook', USER_NB], 'de-DE')).toBe(true);
  });
});
