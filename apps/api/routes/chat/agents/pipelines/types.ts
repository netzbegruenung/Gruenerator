/**
 * Pipeline-Agenten: Agenten, deren Turn aus mehreren Schritten mit je eigenem
 * Kontext besteht.
 *
 * Der Normalfall im Chat ist ein Turn = eine Generierung. Ein Pipeline-Agent
 * schreibt eine Fassung und lässt sie von Schritten prüfen, die NICHT sehen,
 * was die vorigen gesehen haben. Das ist die ganze Idee: eine Instanz, die ihren
 * eigenen Text bewertet, erinnert sich an ihre Absicht statt ihre Auslassung zu
 * suchen — der erste Einfache-Sprache-Lauf (13.08.2026) meldete „vollständig",
 * während ein Ortsname fehlte.
 *
 * Seit 19.10.2026 sieht die Person nur den fertigen Text; der Prüfweg landet in
 * einem Prüfprotokoll-Dokument (siehe `services/agentPipeline.ts`).
 *
 * ── Was ein Eintrag deklariert ──
 *
 * Persona, Intent und die Prompts der Schritte. Modell- und Werkzeugwahl stehen
 * bewusst NICHT dabei: dafür gibt es `intermediateLanes.ts` und die
 * Agenten-Frontmatter, und zwei Orte, die dasselbe entscheiden, driften.
 */

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

export interface PipelineStep {
  /**
   * SSE-`stepId` der Fortschrittszeile. **F1** (CLAUDE.md): wird nicht
   * umbenannt — das Frontend führt Fortschrittszeilen darüber zusammen. Läuft
   * ein Schritt mehrfach (Runden, Abschnitte), hängt der Aufrufer `-<n>` an.
   */
  readonly id: string;
  /** Fortschrittszeile im UI, während der Schritt läuft. */
  readonly title: string;
  readonly systemPrompt: string;
  /** `type` der AI-Anfrage — landet in Kosten- und Nutzungsstatistiken. */
  readonly requestType: string;
  readonly maxTokens: number;
  /** Voreinstellung 0.2 — siehe `runStep` in `services/agentPipeline.ts`. */
  readonly temperature?: number;
  /**
   * Eigene Zeitsperre in ms. Ohne Angabe gilt `env.REQUEST_TIMEOUT` (120 s).
   * Fällt ein Prüfschritt aus, geht eine ungeprüfte Fassung raus — also lieber
   * spät als gar nicht.
   */
  readonly timeoutMs?: number;
  /**
   * Ab wann der Sibling der Lane PARALLEL dazugeschaltet wird. Ohne Angabe —
   * oder ohne Sibling — läuft nur der Primär. Grosszügig setzen, denn jeder
   * Griff kostet den Aufruf doppelt, in Tokens wie in CO₂.
   */
  readonly hedgeAfterMs?: number;
}

export interface PipelineAgent {
  /** Agenten-Identifier. **F1** — nicht umbenennen. */
  readonly identifier: string;
  /** „Leichte Sprache" — Titel des Prüfprotokolls. */
  readonly registerName: string;
  /**
   * Persona für die Fassung, oder null, wenn sie aus dem intern-Repo kommt.
   *
   * Sie darf hier stehen, weil sie reines Handwerk ist (Satzbau, Zahlenregeln,
   * Urheber-Kennzeichnung) — kein Korpuswissen, keine Gegner-Frames. Und sie
   * steht hier statt in der Agenten-Frontmatter, weil `packages/shared` in das
   * Web-Bundle und in jede ausgelieferte Mobile-Binary wandert; `apps/api`
   * nicht. `scripts/check-internal-content.mjs` verbietet deshalb JEDE
   * nicht-leere `systemRole` in der generierten Registry, unabhängig vom Inhalt.
   */
  readonly systemRole: string | null;
  /**
   * Intent, den dieser Agent immer bekommt. Der Klassifikator darf sich hier
   * nicht irren dürfen: was die Pipeline tut, steht schon fest.
   */
  readonly forceIntent: 'produktion';
  readonly steps: {
    /** Blinde Rückübersetzung: bekommt NUR die Fassung. */
    readonly rueck: PipelineStep;
    /** Prüfbericht als Objekt (`pruefbericht.ts`). */
    readonly pruefung: PipelineStep;
    /** Neue Fassung aus Original, Fassung und offenen Punkten. */
    readonly ueberarbeitung: PipelineStep;
    /** Prüft nur die offenen Punkte gegen die neue Fassung. */
    readonly nachpruefung: PipelineStep;
  };
}

/**
 * Der Zustand, den `resolveOriginalText` liest.
 *
 * `threadAttachments` steht darin für die Turns, die kein eigenes Material
 * mitbringen: eine Beanstandung der Fassung IST eine Anweisung, und das Original
 * von vorhin liegt dann nur noch in dieser Liste. Begründung an der Fundstelle.
 */
export type MaterialState = Pick<
  ChatGraphState,
  'attachmentContext' | 'documentMentionContext' | 'currentDocument' | 'threadAttachments'
>;
