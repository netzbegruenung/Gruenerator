/**
 * Der `confirm`-Zweischritt, wie ihn auch der MCP-Server verlangt: ein
 * Werkzeug, das Inhalt löscht oder überschreibt, tut beim ersten Aufruf nichts
 * und liefert eine Rückfrage; erst der erneute Aufruf mit `confirm=true` nach
 * Zustimmung der Person schreibt.
 */
import { acceptsOffer } from '../services/artifactOffer.js';
import { extractTextContent } from '../services/messageHelpers.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const DELETE_ASK = /(?<!\p{L})(?:l(?:ö|oe)sch|papierkorb|wegwerf|weg damit|delete)/iu;

/**
 * `confirm=true` kommt vom Modell — es kann den Zweischritt überspringen.
 * Live 11.10.2026: auf „Mach es abends mit warmem Licht" nach einem
 * gescheiterten KI-Bild rief der Planer `media` mit `delete`, `type: all` und
 * `confirm: true`. Es zählt darum nur, wenn die Person das Löschen in diesem
 * oder im Turn davor selbst verlangt hat, oder wenn sie gerade knapp zustimmt
 * („ja") — dann auf die Rückfrage aus dem ersten Schritt.
 */
function personAgreed(state: ChatGraphState): boolean {
  const userTurns = (state.messages ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => extractTextContent(m.content));
  const last = userTurns.at(-1) ?? '';
  return acceptsOffer(last) || userTurns.slice(-2).some((t) => DELETE_ASK.test(t));
}

export type ConfirmGateStop = { error: string } | { needsConfirmation: true; note: string };

/**
 * `null` heißt: schreiben. Sonst gibt das Werkzeug das Ergebnis unverändert
 * zurück — `needsConfirmation` ist eine Rückfrage, keine Änderung, und der
 * Phantom-Wächter zählt es auch so.
 */
export function confirmGate(opts: {
  state: ChatGraphState;
  threadId: string | null | undefined;
  confirm: boolean;
  /** Die Rückfrage an die Person, z. B. „Soll Folie 2 wirklich gelöscht werden?" */
  question: string;
}): ConfirmGateStop | null {
  // Kein Mensch am Lauf: der Zweischritt bestätigte sich sonst selbst, und die
  // Rückfrage ginge an einen stummen Sink.
  if (!opts.threadId) return { error: 'Das ist in diesem Kontext nicht möglich.' };
  if (!opts.confirm) {
    return {
      needsConfirmation: true,
      note: `${opts.question} Frage die Person und rufe erst nach ihrer Zustimmung mit confirm=true erneut auf.`,
    };
  }
  if (!personAgreed(opts.state)) {
    return {
      error:
        'Die Person hat dem nicht zugestimmt — es wurde nichts gelöscht oder überschrieben. Frage erst nach.',
    };
  }
  return null;
}

/** Merkt eine ausgeführte Änderung für den Schreiber vor (`chatArtifactEdits`). */
export function recordArtifactEdit(state: ChatGraphState, note: string): void {
  state.chatArtifactEdits = [...(state.chatArtifactEdits ?? []), note];
}
