import { describe, it, expect, vi } from 'vitest';

import { pdfProblemNote, resolveAbortOutcome, TRUNCATION_NOTE } from './agenticRespondService.js';
import { runAgenticLoop, type LoopDeps, type LoopEngineParams } from './loopEngine.js';
import { DEFAULT_LOOP_BUDGET, type PersistedStep } from './types.js';

/**
 * The turn budget must not be able to cut the sentence being written.
 *
 * QA, 28.07.2026: two turns in one session ended mid-word — one after
 * "Aktuelles Budget: 13.500 Euro", one after "…des öffentlichen Nah". Both had
 * created an artifact first. That was the tell: a sheet or a PDF costs 30–60s
 * in the gather phase, and the whole turn ran under ONE
 * `AbortSignal.timeout(wallClockMs)`, so the writer inherited whatever was left
 * of the 120s. When it ran out, the stream was torn down mid-token — and the
 * caller only substitutes text when NOTHING was written, so the stump shipped
 * looking like a finished answer. The QA report duly filed the missing halves
 * as content defects ("Konsistenzprüfung enthielt nur das Budget").
 *
 * These tests pin the separation: tool work is bounded by the turn budget, the
 * write phase runs under its own signal.
 */

const plannerModel = { id: 'planner' } as unknown as LoopEngineParams['plannerModel'];
const synthModel = { id: 'synth' } as unknown as LoopEngineParams['synthModel'];

type Part = { type: string; text?: string };

function streamOf(parts: Part[]): ReturnType<LoopDeps['streamText']> {
  return {
    stream: (async function* () {
      yield* parts;
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

/** Records the abortSignal each phase was handed, keyed by model id. */
function recordingDeps(): { deps: LoopDeps; signals: Record<string, AbortSignal> } {
  const signals: Record<string, AbortSignal> = {};
  const deps: LoopDeps = {
    streamText: ((o: { model: { id: string }; abortSignal: AbortSignal }) => {
      signals[o.model.id] = o.abortSignal;
      return streamOf([{ type: 'text-delta', text: 'ANTWORT' }]);
    }) as unknown as LoopDeps['streamText'],
    generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
  };
  return { deps, signals };
}

function params(over: Partial<LoopEngineParams>): LoopEngineParams {
  return {
    mode: 'split',
    plannerModel,
    synthModel,
    tools: {},
    toolSystem: 'TOOLSYS',
    buildSynthSystem: (s) => `SYNTHSYS::${s}`,
    getSourcesBlock: () => '[1] Quelle — Inhalt',
    messages: [],
    maxSteps: 6,
    temperature: 0.3,
    abortSignal: new AbortController().signal,
    forceFinish: () => false,
    onText: vi.fn(),
    onReasoning: vi.fn(),
    ...over,
  };
}

describe('write phase budget', () => {
  /**
   * The regression itself. A turn whose tool budget is already spent must still
   * be able to write — otherwise every turn that generates an artifact first
   * gambles its answer against the leftover milliseconds.
   */
  it('does not abort the writer when the turn budget is spent', async () => {
    const spent = new AbortController();
    spent.abort();
    const write = new AbortController();
    const { deps, signals } = recordingDeps();

    const out = await runAgenticLoop(
      params({ abortSignal: spent.signal, writeAbortSignal: write.signal }),
      deps
    );

    expect(out.text).toBe('ANTWORT');
    expect(signals.synth?.aborted).toBe(false);
  });

  it('still hands the gather phase the turn budget', async () => {
    const turn = new AbortController();
    const write = new AbortController();
    const { deps, signals } = recordingDeps();

    await runAgenticLoop(
      params({ abortSignal: turn.signal, writeAbortSignal: write.signal }),
      deps
    );

    turn.abort();
    expect(signals.planner?.aborted).toBe(true);
    // Same act, opposite verdict — proof the two phases really are separate.
    expect(signals.synth?.aborted).toBe(false);
  });

  it('falls back to the turn signal when no write signal is given', async () => {
    const turn = new AbortController();
    const { deps, signals } = recordingDeps();

    await runAgenticLoop(params({ abortSignal: turn.signal }), deps);

    turn.abort();
    expect(signals.synth?.aborted).toBe(true);
  });
});

describe('loop budget shape', () => {
  /** A ceiling below the tool budget would put the hard abort back inside the
   *  tool phase, which is the ordering this whole split exists to prevent. */
  it('keeps the hard ceiling above the tool budget', () => {
    expect(DEFAULT_LOOP_BUDGET.hardCapMs).toBeGreaterThan(DEFAULT_LOOP_BUDGET.wallClockMs);
  });
});

/**
 * The second half of the fix: even with the budgets separated, a turn can still
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
