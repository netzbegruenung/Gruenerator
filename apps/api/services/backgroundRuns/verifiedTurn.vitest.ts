/**
 * Prüfen und höchstens eine Reparatur (#3221) — über injizierte Deps, ohne
 * Modell. Die Handoff-Regel ist eine reine Funktion des End-Verdikts.
 */
import { describe, it, expect, vi } from 'vitest';

import { needsHumanReview, runVerifiedTurn, type VerifiedTurnDeps } from './verifiedTurn.js';

import type { HeadlessTurnResult } from '../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js';
import type { RunVerdict } from './runVerifier.js';

function turn(text: string, degraded: HeadlessTurnResult['degraded'] = 'none'): HeadlessTurnResult {
  return {
    text,
    degraded,
    degradedReason: null,
    steps: [],
    citations: [],
    sources: [],
    modelName: 'm',
  };
}

function makeDeps(turns: HeadlessTurnResult[], verdicts: RunVerdict[]) {
  let t = 0;
  let v = 0;
  const runTurn = vi.fn(async () => turns[Math.min(t++, turns.length - 1)]!);
  const verify = vi.fn(async () => verdicts[Math.min(v++, verdicts.length - 1)]!);
  return { deps: { runTurn, verify } as unknown as VerifiedTurnDeps, runTurn, verify };
}

const params = {
  instruction: 'Aufgabe\n\n--- QUELLDATEN ---\nviel Material',
  userId: 'u1',
  userLocale: 'de-DE' as const,
  longForm: true,
  slotLabel: 'board-flow-t1',
  deadlineMs: 240_000,
};

describe('runVerifiedTurn', () => {
  it('liefert ein bestandenes Ergebnis ohne Reparatur und prüft gegen die Aufgabe ohne Quelldaten', async () => {
    const { deps, runTurn, verify } = makeDeps([turn('Ergebnis')], [{ ok: true }]);
    const res = await runVerifiedTurn(params, { verifyInstruction: 'Aufgabe' }, deps);
    expect(res).toMatchObject({ content: 'Ergebnis', verdict: { ok: true } });
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith({ instruction: 'Aufgabe', resultText: 'Ergebnis' });
  });

  it('repariert genau einmal mit eigener Decke und liefert den überarbeiteten Entwurf', async () => {
    const { deps, runTurn } = makeDeps(
      [turn('Entwurf'), turn('Besser')],
      [{ ok: false, hint: 'Thema verfehlt' }, { ok: true }]
    );
    const res = await runVerifiedTurn(
      params,
      { verifyInstruction: 'Aufgabe', repairDeadlineMs: 180_000 },
      deps
    );
    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(runTurn.mock.calls[1]![0]).toMatchObject({
      deadlineMs: 180_000,
      feedback: { hint: 'Thema verfehlt', priorDraft: 'Entwurf' },
    });
    expect(res).toMatchObject({ content: 'Besser', verdict: { ok: true, repaired: true } });
    expect(needsHumanReview(res.verdict)).toBe(false);
  });

  it('behält den Erstentwurf, wenn die Reparatur scheitert — und meldet ihn zur Prüfung', async () => {
    const { deps } = makeDeps(
      [turn('Entwurf'), turn('', 'aborted')],
      [{ ok: false, hint: 'Vorgabe ignoriert' }]
    );
    const res = await runVerifiedTurn(params, { verifyInstruction: 'Aufgabe' }, deps);
    expect(res.content).toBe('Entwurf');
    expect(res.verdict).toEqual({ ok: false, hint: 'Vorgabe ignoriert', repaired: false });
    expect(needsHumanReview(res.verdict)).toBe(true);
  });

  it('meldet zur Prüfung, wenn auch die Reparatur beanstandet wird', async () => {
    const { deps } = makeDeps(
      [turn('Entwurf'), turn('Immer noch daneben')],
      [
        { ok: false, hint: 'a' },
        { ok: false, hint: 'b' },
      ]
    );
    const res = await runVerifiedTurn(params, { verifyInstruction: 'Aufgabe' }, deps);
    expect(res.verdict).toEqual({ ok: false, hint: 'b', repaired: true });
    expect(needsHumanReview(res.verdict)).toBe(true);
  });

  it.each(['aborted', 'failed', 'no_answer'] as const)(
    'prüft einen %s-Lauf nicht und liefert nichts',
    async (degraded) => {
      const { deps, verify } = makeDeps([turn('Entschuldigung …', degraded)], [{ ok: true }]);
      const res = await runVerifiedTurn(params, { verifyInstruction: 'Aufgabe' }, deps);
      expect(res).toMatchObject({ content: '', verdict: null });
      expect(res.turn.degraded).toBe(degraded);
      expect(verify).not.toHaveBeenCalled();
    }
  );

  it('schickt ohne Hinweis keine Reparatur los', async () => {
    const { deps, runTurn } = makeDeps([turn('Entwurf')], [{ ok: false }]);
    const res = await runVerifiedTurn(params, { verifyInstruction: 'Aufgabe' }, deps);
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(needsHumanReview(res.verdict)).toBe(true);
  });
});

describe('needsHumanReview', () => {
  it('lässt ungeprüfte und bestandene Läufe still durch', () => {
    expect(needsHumanReview(null)).toBe(false);
    expect(needsHumanReview({ ok: true })).toBe(false);
    expect(needsHumanReview({ ok: true, repaired: true })).toBe(false);
  });
});
