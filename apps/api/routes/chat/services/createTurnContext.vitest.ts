import { describe, it, expect } from 'vitest';

import {
  buildCreateTurnContext,
  turnMaterialBlock,
  withConversationContext,
} from './createTurn.js';

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

describe('withConversationContext', () => {
  const transcript =
    'user: Rechne das aus\nassistant: Ich konnte dazu leider keine Antwort finden.';

  it('frames the thread as background for an ordinary brief', () => {
    const out = withConversationContext('Mach ein PDF daraus', transcript);
    expect(out).toContain('BISHERIGES GESPRÄCH (Hintergrund');
    expect(out).toContain('AUFTRAG:\nMach ein PDF daraus');
  });

  it('frames the thread as the SUBJECT when the brief audits earlier answers', () => {
    // Live 03.08.2026: the transcript said the task had gone unanswered, and the
    // check reported PASS with a freshly computed result attached — it graded
    // the solvable task, not the answer that was given.
    const out = withConversationContext(
      'Prüfe deine Antworten auf Follow-up 1 bis 9 gegen die verlangten Formate',
      transcript
    );
    expect(out).toContain('PRÜFGEGENSTAND');
    expect(out).not.toContain('(Hintergrund');
  });

  it('leaves a bare brief alone when there is no thread', () => {
    expect(withConversationContext('Prüfe deine bisherigen Angaben', '')).toBe(
      'Prüfe deine bisherigen Angaben'
    );
  });
});

// Live 15.10.2026: „erstelle ein Sharepic aus dieser PM" mit Paste-Chip — die
// Datei-Teile werden vor der Umwandlung verworfen, der Generator sah den Satz
// allein. Das Material gehört zum Auftrag, nicht zum Verlauf.
describe('turnMaterialBlock', () => {
  it('rahmt das Material als Daten und steht vor dem Auftrag', () => {
    const material = turnMaterialBlock('Die Kreisumlage steigt um einen Prozentpunkt.');
    const brief = withConversationContext('erstelle ein Sharepic aus dieser PM', '', material);
    expect(brief).toContain('Kreisumlage');
    expect(brief.indexOf('Kreisumlage')).toBeLessThan(brief.indexOf('AUFTRAG:'));
    expect(brief).toMatch(/<[^>]*type="anhang"/);
  });

  it('steht zwischen Verlauf und Auftrag', () => {
    const brief = withConversationContext(
      'mach daraus eine Präsentation',
      'assistant: Gern.',
      turnMaterialBlock('Kreisumlage')
    );
    expect(brief.indexOf('BISHERIGES GESPRÄCH')).toBeLessThan(brief.indexOf('Kreisumlage'));
    expect(brief.indexOf('Kreisumlage')).toBeLessThan(brief.indexOf('AUFTRAG:'));
  });

  it('ohne Material bleibt alles wie vorher', () => {
    expect(turnMaterialBlock(null)).toBe('');
    expect(turnMaterialBlock('   ')).toBe('');
    expect(withConversationContext('Auftrag', '', turnMaterialBlock(undefined))).toBe('Auftrag');
  });

  it('kappt grosses Material', () => {
    expect(turnMaterialBlock('x'.repeat(5000), 1000).length).toBeLessThan(1500);
  });
});
