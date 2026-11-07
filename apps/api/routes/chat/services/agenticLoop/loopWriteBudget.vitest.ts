import { describe, it, expect } from 'vitest';

import { resolveAbortOutcome, TRUNCATION_NOTE } from './agenticRespondService.js';
import { pdfProblemNote } from './synthVerdicts.js';
import { DEFAULT_LOOP_BUDGET, type PersistedStep } from './types.js';

/**
 * The turn budget must not be able to cut the sentence being written.
 *
 * QA, 28.07.2026: two turns ended mid-word after an artifact had eaten 30–60 s
 * of the tool phase, and the stump shipped looking like a finished answer.
 * The budget is soft since (`forceFinish`, loopBudget.ts); these tests pin the
 * ordering and the note on a stump.
 */

describe('loop budget shape', () => {
  /** A ceiling below the tool budget would put the hard abort back inside the
   *  tool phase. */
  it('keeps the hard ceiling above the tool budget', () => {
    expect(DEFAULT_LOOP_BUDGET.hardCapMs).toBeGreaterThan(DEFAULT_LOOP_BUDGET.wallClockMs);
  });
});

/**
 * Even with a soft budget, a turn can still
 * die mid-answer (client disconnect, the absolute ceiling, a wedged provider).
 * When it does, the stump must say so.
 */
describe('resolveAbortOutcome', () => {
  it('marks a half-written answer as incomplete instead of shipping it silently', () => {
    const outcome = resolveAbortOutcome({
      text: 'Konsistenzprüfung:\nAktuelles Budget: 13.500 Euro',
      aborted: true,
    });
    expect(outcome).toEqual({ delta: TRUNCATION_NOTE, mode: 'append' });
  });

  /**
   * APPEND, not replace — the whole point. Recorded `textOffset`s index into
   * the streamed prefix, so rewriting the text would mis-place every card on
   * reload, and the user would lose the part that DID arrive.
   */
  it('never rewrites text that already reached the user', () => {
    const written = 'Erstens die Cooling Zones';
    const outcome = resolveAbortOutcome({ text: written, aborted: true });
    expect(outcome?.mode).toBe('append');
    expect(`${written}${outcome?.delta}`.startsWith(written)).toBe(true);
  });

  /**
   * A non-abort error with text means the answer streamed to completion and
   * something AFTER it threw. Calling that one incomplete would be a lie.
   */
  it('stays silent when a complete answer was followed by an error', () => {
    expect(resolveAbortOutcome({ text: 'Vollständige Antwort.', aborted: false })).toBeNull();
  });

  it('replaces, not appends, when nothing was written at all', () => {
    const timedOut = resolveAbortOutcome({ text: '   ', aborted: true });
    expect(timedOut?.mode).toBe('replace');
    expect(timedOut?.delta).toMatch(/zu lange gedauert/);

    const failed = resolveAbortOutcome({ text: '', aborted: false });
    expect(failed?.mode).toBe('replace');
    expect(failed?.delta).toMatch(/schiefgelaufen/);
  });

  /** The note is for users, so it must not leak the machine's vocabulary. */
  it('explains the abort in German, without technical terms', () => {
    expect(TRUNCATION_NOTE).toMatch(/unvollständig/);
    expect(TRUNCATION_NOTE).not.toMatch(/abort|timeout|error/i);
  });
});

/**
 * The PDF tool reopens the file it just wrote and reports real defects — a
 * missing text layer, deleted characters, an untagged structure. Both its
 * description and its result note order the model to pass them on. Live it did
 * not: characters had been dropped from the document's own title and the chat
 * called the PDF fine. An accessibility check the model may quietly skip is
 * not a check.
 */
describe('pdfProblemNote', () => {
  const step = (probleme: string[]): PersistedStep => ({
    toolCallId: 't1',
    toolName: 'create_pdf',
    args: {},
    result: { probleme },
  });

  it('surfaces a finding the answer left out', () => {
    const note = pdfProblemNote(
      [step(['2 Zeichen konnten nicht dargestellt werden und wurden entfernt: ‑ ‑'])],
      'Das PDF ist fertig und steht zum Download bereit.'
    );
    expect(note).toContain('Zeichen konnten nicht dargestellt');
  });

  it('stays quiet when the answer already reported it', () => {
    const problem = 'Die Dokumentsprache fehlt.';
    expect(pdfProblemNote([step([problem])], `Hinweis: ${problem} Ich kann das nachtragen.`)).toBe(
      ''
    );
  });

  it('stays quiet when the self-check found nothing', () => {
    expect(pdfProblemNote([step([])], 'Fertig.')).toBe('');
    expect(pdfProblemNote([], 'Fertig.')).toBe('');
  });

  it('ignores steps from other tools', () => {
    const other: PersistedStep = {
      toolCallId: 't2',
      toolName: 'create_sheet',
      args: {},
      result: { probleme: ['irgendwas'] },
    };
    expect(pdfProblemNote([other], 'Fertig.')).toBe('');
  });
});
