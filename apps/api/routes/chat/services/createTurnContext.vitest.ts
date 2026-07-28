import { describe, it, expect } from 'vitest';

import { buildCreateTurnContext } from './createTurn.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * "jetzt als PDF exportieren" has to reach the generator with the thing it
 * points at.
 *
 * Live failure: a create turn built NO message history, so the generator saw
 * that sentence and nothing else. The half-page it referred to was structurally
 * invisible, and the PDF was filled from the only other material in scope — a
 * Kanban confirmation line, cited as source [1].
 */

type Msgs = ChatGraphState['messages'];

const msg = (role: 'user' | 'assistant', content: string): Msgs[number] =>
  ({ role, content }) as Msgs[number];

describe('buildCreateTurnContext', () => {
  it('carries the preceding answer, which is what "daraus" points at', () => {
    const context = buildCreateTurnContext([
      msg('user', 'schreibe eine halbe seite text zu marilyn monroe'),
      msg('assistant', 'Marilyn Monroe, geboren als Norma Jeane Mortenson …'),
      msg('user', 'jetzt als pdf exportieren'),
    ]);
    expect(context).toContain('Norma Jeane Mortenson');
  });

  it('drops the last user message — that one IS the brief', () => {
    const context = buildCreateTurnContext([
      msg('assistant', 'Der Antragstext lautet …'),
      msg('user', 'jetzt als pdf exportieren'),
    ]);
    expect(context).not.toContain('jetzt als pdf exportieren');
  });

  it('is bounded by characters, not by message count', () => {
    // The reason the old `slice(-4)` was wrong: a run of short confirmations
    // would push the substantive answer out of a count-based window. Twenty
    // one-word messages must not cost the essay its place.
    const filler = Array.from({ length: 20 }, () => msg('assistant', 'Notiert.'));
    const context = buildCreateTurnContext([
      msg('assistant', 'Die entscheidende Passage über Marilyn Monroe.'),
      ...filler,
      msg('user', 'mach ein PDF draus'),
    ]);
    expect(context).toContain('Die entscheidende Passage');
  });

  it('caps a single huge message so it cannot eat the whole budget', () => {
    const wall = 'x'.repeat(50_000);
    const context = buildCreateTurnContext([
      msg('assistant', 'Kurzer wichtiger Satz.'),
      msg('assistant', wall),
      msg('user', 'mach ein PDF draus'),
    ]);
    expect(context.length).toBeLessThan(30_000);
    expect(context).toContain('Kurzer wichtiger Satz');
  });

  it('keeps roles so the model can tell instruction from answer', () => {
    const context = buildCreateTurnContext([
      msg('user', 'Was ist mit dem Budget?'),
      msg('assistant', 'Budget = 5.250 Euro.'),
      msg('user', 'mach ein PDF draus'),
    ]);
    expect(context).toMatch(/user: Was ist mit dem Budget\?/);
    expect(context).toMatch(/assistant: Budget = 5\.250 Euro\./);
  });

  it('survives an empty or single-message thread', () => {
    expect(buildCreateTurnContext([])).toBe('');
    expect(buildCreateTurnContext([msg('user', 'erstelle ein PDF über Radverkehr')])).toBe('');
  });
});
