/**
 * Erkennt eine Antwort, die mitten im Wort aufhört, obwohl der Anbieter
 * `finish_reason: stop` gemeldet hat — und meldet sie an GlitchTip.
 *
 * Live am 19.11.2026 auf Ultra (Mistral Large 4): ein Gastbeitrag endete bei
 * „… Jetzt muss der Bund liefe" (2.593 Zeichen), ohne Warnung. `length`,
 * `interrupted` und `error` repariert `unifiedRepairReason` längst; `stop`
 * gilt als fertig, und der Text wird nirgends angesehen. Wie oft das passiert,
 * ist unbekannt (6 Rohläufe danach endeten sauber) — deshalb wird hier nur
 * gezählt, nicht repariert. Ein Fehlalarm kostet so nur eine Meldung.
 */
import { createLogger } from '../../../../utils/logger.js';
import { reportBackgroundError } from '../../../../utils/reportBackgroundError.js';

const log = createLogger('AgenticLoopEngine');

/**
 * Nur Fließtext zählt: ein Absatz dieser Länge mit mindestens einem Satzende
 * davor. Unterschriften („Franziska Brantner"), Überschriften und kurze
 * Schlusszeilen enden legitim ohne Satzzeichen und sind kürzer.
 */
const MIN_PROSE_PARAGRAPH_CHARS = 120;

/** Zeilen, die ohne Satzzeichen enden dürfen: Liste, Überschrift, Tabelle, Zitat. */
const STRUCTURED_LINE = /^\s*(?:[-*•>|#]|\d+[.)]\s)/;

export function endsMidWord(text: string): boolean {
  const trimmed = text.trimEnd();
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
  if (lastLine.length < MIN_PROSE_PARAGRAPH_CHARS) return false;
  if (STRUCTURED_LINE.test(lastLine)) return false;
  if (!/[.!?]\s/.test(lastLine)) return false;
  return /\p{L}$/u.test(lastLine);
}

/** Meldet einen Abbruch mitten im Wort bei regulärem Ende. Ändert nichts. */
export function reportMidWordEnd(
  text: string,
  finishReason: string | null,
  model: string,
  phase: 'unified' | 'synth'
): void {
  if (finishReason !== 'stop' || !endsMidWord(text)) return;
  log.warn(
    `[Engine] ${phase} answer ends mid-word despite finishReason=stop (${text.length} chars, ${model})`
  );
  reportBackgroundError(new Error(`${phase} answer ended mid-word with finishReason=stop`), {
    job: 'agentic-answer-midword',
    model,
    phase,
    chars: text.length,
  });
}
