/**
 * Die einzige Frist, die den GANZEN Zug deckelt.
 *
 * Alle anderen Fristen im Chat-Stack sind PHASEN-Fristen: die Leerlauf-Frist
 * (`streamIdleDeadline.ts`), die Turn-Uhr des Einzeldurchlaufs
 * (`SINGLE_PASS_WALL_CLOCK_MS`), die Werkzeug- und Schreibdecke des Loops
 * (`hardCapMs` in `agenticLoop/loopBudget.ts`). Keine davon sieht die anderen.
 * Klassifikator und Suche laufen ganz ohne Frist, und weil undici seine
 * Header-/Body-Fristen je Anfrage neu stellt (je 300 s), ist der ungünstigste
 * Fall die SUMME: Klassifikator + Suche + Antwort ≈ 900 s, in denen der Client
 * nichts sieht und das Log schweigt.
 *
 * Diese Decke wird deshalb am Router-Eingang gestellt — vor der Klassifikation,
 * nicht erst im Loop — und reicht als `signal` in beide Antwortpfade.
 *
 * ZUR ZAHL. Der Anlass war ein Zug über 1.229.798 ms im Eval-Lauf vom
 * 18.08.2026. Dieser Wert ist ein MESSARTEFAKT: der Messrechner hat geschlafen.
 * Jede lange Lücke im Backend-Log deckt sich sekundengenau mit einem
 * macOS-Sleep→DarkWake-Zyklus, und ein 20-s-Werkzeug-Timeout feuerte in
 * derselben Lücke 974 s zu spät — Timer standen still, es hing nichts.
 * Schlafbereinigt über alle 319 protokollierten Züge beider Lanes:
 * p50 7,9 s · p95 124 s · p99 159 s · max 235 s. Kein Zug hat die bestehenden
 * 300 s je gerissen.
 *
 * 360_000 ist darum `hardCapMs` (300 s) plus 60 s Vorlauf für Klassifikator,
 * Suche und Werkzeugmontage: hoch genug, um gegen die gemessene Wirklichkeit
 * nie zu feuern, niedrig genug, um den 900-s-Fall zu kappen. Eine engere Decke
 * (im Bericht als 180_000 vorgeschlagen, gerechnet auf dem unbereinigten p95)
 * läge UNTER dem gemessenen Maximum und würde legitime lange Züge abschneiden.
 */

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('TurnDeadline');

export const TURN_CEILING_MS = (() => {
  const n = Number.parseInt(process.env.CHAT_TURN_CEILING_MS ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 360_000;
})();

export interface TurnDeadline {
  /** Reicht in beide Antwortpfade: `reqSignal` (agentisch) bzw. `signal`
   *  (Einzeldurchlauf). Bricht ab, wenn die Decke reisst. */
  signal: AbortSignal;
  /** Am Ende jedes Zuges aufrufen — sonst hält der Timer den Prozess-Timer
   *  bis zur Decke, auch wenn der Zug längst fertig ist. */
  clear: () => void;
}

/**
 * Eine WARN-Zeile ist der halbe Zweck dieser Datei. Der Lauf vom 18.08. zeigte
 * 20 Minuten Log-Stille; ob die aus einem Hänger oder aus einem schlafenden
 * Rechner kam, war hinterher nur über `pmset -g log` zu klären. Reisst die
 * Decke, steht das ab jetzt im Log — mit Anfrage-Kennung, damit der Zug
 * zuzuordnen ist.
 */
export function createTurnDeadline(requestId: string): TurnDeadline {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    log.warn(
      `[ChatGraph] turn ceiling of ${TURN_CEILING_MS}ms reached after ${Date.now() - startedAt}ms — aborting request_id=${requestId}`
    );
    controller.abort(new Error(`Turn ceiling of ${TURN_CEILING_MS}ms exceeded`));
  }, TURN_CEILING_MS);
  // Der Zug soll den Prozess nicht am Leben halten, nur weil die Decke noch
  // läuft — dieselbe Wahl trifft `AbortSignal.timeout` intern.
  timer.unref?.();
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}
