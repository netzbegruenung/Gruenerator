import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Die Planer-Lane wird pro Zug GENAU EINMAL aufgelöst.
 *
 * Seit die Wahl an `isModelSlow` hängt (`loopPlannerChoice`), ist sie nicht
 * mehr über den Zug hinweg stabil: vermerkt der Zug selbst einen Stillstand,
 * liefert die nächste Auflösung die Ausweichstufe. Ein zweiter Aufruf im selben
 * Zug redet also über eine andere Lane als die, die lief.
 *
 * Genau das passierte in der ersten Fassung dieser Reparatur: `logTurnSummary`
 * holte den Namen über `loopPlannerModelName()` neu, und die Zeile
 * `Complete: … planner=…` nannte nach einem Stillstand den falschen Host —
 * dieselbe Verwechslung, gegen die die Reparatur angetreten war.
 *
 * Warum als Quelltextprüfung: der Fehler ist kein falscher Wert, sondern ein
 * zweiter AUFRUF. Ein Verhaltenstest müsste den halben Zug stellen, um ihn
 * sichtbar zu machen; die Regel dagegen ist an einer Zeile ablesbar.
 */

const SERVICE = fileURLToPath(new URL('./agenticRespondService.ts', import.meta.url));

describe('planner lane: one resolution per turn', () => {
  const source = readFileSync(SERVICE, 'utf8');
  /** Kommentare zählen nicht — die Regel wird dort ausdrücklich erklärt. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('löst die Lane genau einmal auf', () => {
    const calls = code.match(/resolveLoopPlannerLane\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('holt den Planer-Namen NICHT über die zweite Tür', () => {
    // `loopPlannerModelName()` löst neu auf. Wer den Namen im Zug braucht,
    // nimmt `plannerLane`, das schon aufgelöst danebensteht.
    expect(code).not.toMatch(/loopPlannerModelName/);
  });

  it('gibt der Turn-Zusammenfassung die aufgelöste Lane mit', () => {
    expect(code).toMatch(/plannerName:\s*plannerLane\s*\?/);
  });
});
