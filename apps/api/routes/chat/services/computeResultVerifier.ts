/**
 * Plausibilitätsprüfung für ein ERFOLGREICHES `tabelle_auswerten`-Ergebnis.
 *
 * Die Fehlerklasse aus dem Beta-Lauf: der Code läuft durch, beantwortet aber
 * die falsche Frage (falsche Spalte, doppelte Summe, falsche Gruppierung).
 * `hasBrokenComputeValues` sieht das nicht — die Zahl sieht ja gut aus. Ein
 * kleiner Modellaufruf beurteilt Frage + Code + Ergebnis; ein Zweifel wird
 * als Hinweis ins tool-result gelegt, damit der Loop mit präzisiertem Auftrag
 * nachlegen kann. Übernommen aus dem `computeVerifierNode` des alten
 * Vor-Loop-Pfads (#5044), Prompt und Lane unverändert.
 *
 * Fail-open: jeder Parse-, Transport- oder Zeitfehler heisst „kein Hinweis" —
 * die Prüfung darf eine funktionierende Antwort nie aufhalten.
 */
import { aiText } from '../../../services/ai/generate.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ComputeVerifier');

/** Die Prüfung läuft vor dem Weiterstreamen der Fortsetzung — kurz halten. */
const VERIFIER_TIMEOUT_MS = 15_000;
/** Ein nacktes `print(df)` packt die ganze Tabelle in einen Wert. */
const MAX_RESULT_CHARS = 1500;

const VERIFIER_PROMPT = `Du prüfst das Ergebnis einer pandas-Berechnung auf Plausibilität. Du bekommst die Frage der*des Nutzer*in, den ausgeführten Code und das Ergebnis.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"plausible": true} oder {"plausible": false, "hint": "<kurzer Hinweis, was am Code falsch ist>"}

Als NICHT plausibel gilt nur, was klar erkennbar falsch ist:
- Das Ergebnis beantwortet eine andere Frage als gestellt (falsche Spalte, falsche Gruppierung).
- Der Code leitet eine vorhandene Spalte doppelt her oder addiert Unzusammenhängendes.
- Werte sind offensichtlich unmöglich (negative Anzahl, leeres Ergebnis trotz Daten).
Im Zweifel: {"plausible": true}. Du kennst die Rohdaten nicht — beurteile nur Code-Logik vs. Frage.`;

export interface VerifierVerdict {
  plausible: boolean;
  hint?: string;
}

export function parseVerifierResponse(raw: string): VerifierVerdict {
  try {
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    const parsed = JSON.parse(stripped) as { plausible?: unknown; hint?: unknown };
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.plausible === 'boolean') {
      return {
        plausible: parsed.plausible,
        ...(typeof parsed.hint === 'string' && parsed.hint.length > 0 && { hint: parsed.hint }),
      };
    }
  } catch {
    /* fail open below */
  }
  return { plausible: true };
}

/**
 * Liefert den Hinweis, wenn das Ergebnis klar unplausibel ist, sonst `null`.
 * `question` ist der Turn-Text der Person, `auftrag` die Umformulierung des
 * Loop-Modells — beide gehen mit, weil der Fehler in jedem der beiden Schritte
 * liegen kann (Modell missversteht die Person, Codegen missversteht den Auftrag).
 */
export async function verifyComputeResult(params: {
  question: string | null;
  auftrag: string;
  code: string;
  entries: Array<{ label: string; value: string }>;
}): Promise<string | null> {
  const { question, auftrag, code, entries } = params;
  if (!code || !auftrag) return null;

  try {
    const entriesText = entries
      .map((e) => `- ${e.label}: ${e.value}`)
      .join('\n')
      .slice(0, MAX_RESULT_CHARS);
    const questionBlock =
      question && question.trim() && question.trim() !== auftrag
        ? `Frage: ${question.trim()}\nAuftrag an den Code: ${auftrag}`
        : `Frage: ${auftrag}`;
    const content = await aiText({
      lane: 'chat_compute_verify',
      pinned: 'compute',
      system: VERIFIER_PROMPT,
      prompt: `${questionBlock}

Ausgeführter Code:
${code}

Ergebnis:
${entriesText}

Ist das plausibel?`,
      maxOutputTokens: 200,
      temperature: 0,
      timeoutMs: VERIFIER_TIMEOUT_MS,
      json: true,
    });

    const verdict = parseVerifierResponse(content);
    if (verdict.plausible) return null;
    log.info(`[ComputeVerifier] Unplausibles Ergebnis: ${verdict.hint ?? '(kein Hinweis)'}`);
    return verdict.hint ?? 'Das Ergebnis passt vermutlich nicht zur Frage.';
  } catch (error: unknown) {
    log.warn(
      `[ComputeVerifier] Fehler (kein Hinweis): ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
