/**
 * Pipeline-Agenten: Agenten, deren Turn aus mehreren Schritten mit je eigenem
 * Kontext besteht.
 *
 * Der Normalfall im Chat ist ein Turn = eine Generierung. Ein Pipeline-Agent
 * hängt daran weitere Schritte, die NICHT sehen, was die vorigen gesehen haben.
 * Das ist die ganze Idee: eine Instanz, die ihren eigenen Text bewertet,
 * erinnert sich an ihre Absicht statt ihre Auslassung zu suchen — der erste
 * Einfache-Sprache-Lauf (13.08.2026) meldete „vollständig", während ein
 * Ortsname fehlte.
 *
 * Bis dahin stand diese Mechanik als `isEinfacheSpracheAgent(...)`-Sonderfälle
 * an vier Stellen im Router. Sie steht jetzt hier, weil ein zweiter Agent mit
 * derselben Bauform sonst dieselben vier Stellen erneut anfassen müsste — und
 * weil man an einer Registry ablesen kann, was ein Agent tut, an vier verteilten
 * `if`s dagegen nicht.
 *
 * ── Was ein Eintrag deklariert ──
 *
 * Genau die fünf Dinge, die der Router sonst hart verdrahten müsste. Modell- und
 * Werkzeugwahl stehen bewusst NICHT dabei: dafür gibt es `providerSelector.ts`
 * und die Agenten-Frontmatter, und zwei Orte, die dasselbe entscheiden, driften.
 */

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/** Was ein Nachschritt beim Bauen seiner Eingabe kennt. */
export interface PipelineStepContext {
  /** Der Ausgangstext des Turns — dieselbe Zeichenkette, die Schritt 1 im
   *  Systemprompt festgenagelt bekam. */
  readonly original: string;
  /** Was Schritt 1 erzeugt und bereits an den Nutzer gestromt hat. */
  readonly produced: string;
  /** Ergebnisse der vorherigen Nachschritte, nach `id`. Fehlt ein Eintrag,
   *  ist der Schritt ausgefallen — Nachschritte müssen das aushalten. */
  readonly previous: ReadonlyMap<string, string>;
}

export interface PipelineStep {
  /**
   * SSE-`stepId` und Schlüssel in `previous`. **F1** (CLAUDE.md): wird nicht
   * umbenannt — das Frontend führt Fortschrittszeilen darüber zusammen.
   */
  readonly id: string;
  /** Fortschrittszeile im UI, während der Schritt läuft. */
  readonly title: string;
  /** Markdown-Überschrift, unter der das Ergebnis erscheint. */
  readonly heading: string;
  readonly systemPrompt: string;
  /** `type` der AI-Anfrage — landet in Kosten- und Nutzungsstatistiken. */
  readonly requestType: string;
  readonly maxTokens: number;
  /** Voreinstellung 0.2 — siehe `runStep` in `services/agentPipeline.ts`. */
  readonly temperature?: number;
  /**
   * Eigene Zeitsperre in ms. Ohne Angabe gilt `env.REQUEST_TIMEOUT` (120 s),
   * und das ist für einen Nachschritt der falsche Massstab: die Fassung steht
   * beim Nutzer schon auf dem Bildschirm, es wartet niemand auf ein leeres
   * Fenster. Fällt der Schritt dagegen aus, geht eine ungeprüfte Fassung raus.
   */
  readonly timeoutMs?: number;
  /**
   * Baut die EINE Nutzernachricht des Schritts. Was hier nicht hineingeht,
   * sieht der Schritt nicht — kein Verlauf, keine Anhänge. Genau darin liegt
   * der Wert: die blinde Rückübersetzung ist nur blind, solange ihre
   * Nachrichtenliste das Original nicht enthält.
   *
   * `null` überspringt den Schritt still (die Vorbedingung fehlt).
   */
  buildUserMessage(ctx: PipelineStepContext): string | null;
  /**
   * Was stattdessen erscheint, wenn der Schritt nichts liefert. Nie leer:
   * eine ausgefallene Prüfung, die schweigt, sieht aus wie eine bestandene.
   */
  readonly missingText: string;
}

export interface PipelineAgent {
  /** Agenten-Identifier. **F1** — nicht umbenennen. */
  readonly identifier: string;
  /**
   * Persona für Schritt 1, oder null, wenn sie aus dem intern-Repo kommt.
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
  /**
   * Untergrenze für Schritt 1, ab der die Nachschritte laufen. Darunter hat der
   * Nutzer keinen Fachtext übertragen lassen, sondern eine Frage gestellt — die
   * Nachschritte wären reine Kosten.
   */
  readonly minProducedChars: number;
  /** Was erscheint, wenn kein Ausgangstext auffindbar war. */
  readonly noOriginalText: string;
  readonly steps: readonly PipelineStep[];
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
