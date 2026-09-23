/**
 * Ein Hintergrundlauf mit Ergebnis-Prüfung (#3221): voller agentischer Loop
 * ohne Leitung, danach ein Verdikt und bei Beanstandung GENAU EINE
 * Reparatur-Runde (ein if, keine Schleife). Gemeinsame Tür für wiederkehrende
 * Aufgaben und den Board-Agenten.
 *
 * Geliefert wird immer — scheitert die Reparatur (degraded oder leer), bleibt
 * der Erstentwurf, denn es wartet niemand, der nachbessern könnte. Was der
 * Aufrufer mit einem am Ende noch beanstandeten Verdikt tut, ist seine
 * Handoff-Regel (`needsHumanReview`).
 *
 * Harte Ausfälle (`aborted`/`failed`) und leere Läufe (`no_answer`) werden
 * nicht geprüft; `content` ist dann leer und der Aufrufer entscheidet an
 * `turn.degraded`.
 */
import {
  runHeadlessAgenticTurn as runHeadlessAgenticTurnReal,
  type HeadlessTurnParams,
  type HeadlessTurnResult,
} from '../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js';

import { verifyBackgroundResult as verifyReal, type RunVerdict } from './runVerifier.js';

export interface VerifiedTurnDeps {
  runTurn: typeof runHeadlessAgenticTurnReal;
  verify: typeof verifyReal;
}

export const defaultVerifiedTurnDeps: VerifiedTurnDeps = {
  runTurn: runHeadlessAgenticTurnReal,
  verify: verifyReal,
};

export interface VerifiedTurnResult {
  /** Der erste Lauf — sein `degraded` entscheidet über Empty-/Failed-Pfad. */
  turn: HeadlessTurnResult;
  /** Das zu liefernde Ergebnis; leer, wenn der erste Lauf keins hatte. */
  content: string;
  /** Null, wenn nicht geprüft wurde (Ausfall oder leer). */
  verdict: RunVerdict | null;
}

export async function runVerifiedTurn(
  params: HeadlessTurnParams,
  opts: {
    /** Wogegen geprüft wird — die Aufgabe ohne Kontext/Quelldaten. */
    verifyInstruction: string;
    /** Eigene Decke für die Reparatur-Runde. Default: wie der erste Lauf. */
    repairDeadlineMs?: number;
  },
  deps: VerifiedTurnDeps = defaultVerifiedTurnDeps
): Promise<VerifiedTurnResult> {
  const turn = await deps.runTurn(params);
  if (turn.degraded !== 'none' || !turn.text) {
    return { turn, content: '', verdict: null };
  }

  let content = turn.text;
  let verdict = await deps.verify({ instruction: opts.verifyInstruction, resultText: content });
  if (!verdict.ok && verdict.hint) {
    const second = await deps.runTurn({
      ...params,
      feedback: { hint: verdict.hint, priorDraft: content },
      ...(opts.repairDeadlineMs != null && { deadlineMs: opts.repairDeadlineMs }),
    });
    if (second.degraded === 'none' && second.text.trim()) {
      content = second.text;
      verdict = {
        ...(await deps.verify({ instruction: opts.verifyInstruction, resultText: content })),
        repaired: true,
      };
    } else {
      verdict = { ...verdict, repaired: false };
    }
  }
  return { turn, content, verdict };
}

/**
 * Die Handoff-Regel, deterministisch: ein Mensch soll nachsehen, wenn die
 * Prüfung das gelieferte Ergebnis auch nach der Reparatur noch beanstandet.
 * Fehlschläge melden ihre Aufrufer ohnehin; ein ungeprüftes (null) oder
 * bestandenes Ergebnis läuft still durch.
 */
export function needsHumanReview(verdict: RunVerdict | null): verdict is RunVerdict {
  return verdict != null && !verdict.ok;
}
