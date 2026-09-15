/**
 * Ergebnis-Prüfung für Hintergrundläufe (#3221, Face 2).
 *
 * Ein kleiner Modell-Richter über Aufgabe vs. Ergebnis eines wiederkehrenden
 * Laufs — das gebundene Gegenstück zu LobeHubs Verifier-Agent, nach dem
 * Vorbild von `computeVerifierNode`: fail-open (die Prüfung darf nie ein
 * funktionierendes Ergebnis blockieren), begrenzte Eingaben, exportierter
 * Parser für Tests. Das Verdikt ist in v1 ein MESSWERT, kein Gate: geliefert
 * wird immer, das Verdikt steht als `recurring_task_runs.verdict` daneben —
 * so werden False-Negative-Raten messbar, bevor je jemand gated.
 */
import { createLogger } from '../../utils/logger.js';
import { aiText } from '../ai/generate.js';

const log = createLogger('RecurringVerifier');

const VERIFIER_PROMPT = `Du prüfst das Ergebnis einer automatisch ausgeführten wiederkehrenden Aufgabe. Du bekommst die Aufgabenstellung und das erzeugte Ergebnis.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"ok": true} oder {"ok": false, "hint": "<kurzer, konkreter Verbesserungshinweis>"}

Als NICHT ok gilt nur, was klar erkennbar daneben liegt:
- Das Ergebnis behandelt ein anderes Thema als beauftragt.
- Es ignoriert eine ausdrückliche Vorgabe der Aufgabe (Format, Umfang, Sprache).
- Es ist im Kern Meta-Text statt Ergebnis (Entschuldigung, Rückfrage, Beschreibung dessen, was man tun könnte).
Im Zweifel: {"ok": true}. Du kennst die Recherchequellen nicht — beurteile nur Aufgabe vs. Ergebnis.`;

/** Aufgabenstellung ist Kontext, das Ergebnis der Prüfgegenstand — es bekommt
 *  den größeren Ausschnitt. */
const MAX_INSTRUCTION_CHARS = 1000;
const MAX_RESULT_CHARS = 4000;

export interface RunVerdict {
  ok: boolean;
  hint?: string;
  /** Nur nach einer Reparatur-Runde gesetzt: true ⇒ das gelieferte Ergebnis
   *  ist der überarbeitete Entwurf, false ⇒ die Reparatur scheiterte und der
   *  Erstentwurf wurde geliefert. */
  repaired?: boolean;
}

export function parseVerdict(raw: string): RunVerdict {
  try {
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    const parsed = JSON.parse(stripped) as { ok?: unknown; hint?: unknown };
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.ok === 'boolean') {
      return {
        ok: parsed.ok,
        ...(typeof parsed.hint === 'string' && parsed.hint.length > 0 && { hint: parsed.hint }),
      };
    }
  } catch {
    /* fail open below */
  }
  return { ok: true };
}

export async function verifyRecurringResult(p: {
  instruction: string;
  resultText: string;
}): Promise<RunVerdict> {
  if (!p.instruction.trim() || !p.resultText.trim()) return { ok: true };

  try {
    const userMessage = `Aufgabe:
${p.instruction.slice(0, MAX_INSTRUCTION_CHARS)}

Ergebnis:
${p.resultText.slice(0, MAX_RESULT_CHARS)}

Ist das Ergebnis ok?`;

    const content = await aiText({
      lane: 'background_verify',
      system: VERIFIER_PROMPT,
      prompt: userMessage,
      maxOutputTokens: 200,
      temperature: 0,
      json: true,
    });

    const verdict = parseVerdict(content);
    if (!verdict.ok) {
      log.info(`[Verifier] Ergebnis beanstandet: ${verdict.hint ?? '(kein Hinweis)'}`);
    }
    return verdict;
  } catch (error: unknown) {
    log.warn(
      `[Verifier] Fehler (fail open): ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: true };
  }
}
