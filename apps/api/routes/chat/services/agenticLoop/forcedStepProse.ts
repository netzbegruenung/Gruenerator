/**
 * Prosa auf einem erzwungenen Werkzeugschritt.
 *
 * Ein Schritt mit `toolChoice: 'required'` (oder einem benannten Werkzeug) soll
 * einen Aufruf liefern, keinen Text. Das SDK prüft das erst, wenn der Schritt
 * endet (`ToolChoiceViolationError`) — bis dahin geht jedes Text-Delta live an
 * die Person. Mistral Large 4 beendet einen solchen Schritt aber oft gar nicht:
 * sobald es mit Text begonnen hat, kommt es unter `required` nicht mehr zum
 * Ende-Token und schreibt weiter, bis der Anbieter abschneidet.
 *
 * Gemessen 16.11.2026 roh gegen `api.mistral.ai` (Verlauf „kannst du Bilder
 * generieren" → „mach aus diesem Foto ein Bild"): `auto` 3/3 sauber; `required`
 * 2/3 Mal 1.700–1.800 Zeichen Absage plus Emoji-Ketten bis `finish=length`
 * (48 s, 101 s), kein Aufruf. Cortecs-Gemma rief unter `required` 3/3 sofort ein
 * Werkzeug. In Prod (Melious ohne Guthaben, Large 4 als Ausweich) waren das die
 * Schleifen „Ich höre jetzt wirklich auf … FERTIG. 😊" mit bis zu 77.707 Zeichen,
 * jede mit `steps=0` und `force=…` im Log.
 *
 * Deshalb hält dieser Filter den Text eines erzwungenen Schritts zurück. Kommt
 * ein Werkzeugaufruf oder endet der Schritt, geht das Zurückgehaltene
 * unverändert weiter — ein kurzer Vorsatz vor dem Aufruf bleibt also erhalten.
 * Überschreitet der Text {@link FORCED_STEP_PROSE_BUDGET} ohne Aufruf, bricht er
 * den Strom mit {@link ForcedStepProseError} ab; der Aufrufer behandelt das wie
 * den Verstoß, den das SDK am Schrittende gemeldet hätte, und die Reparatur
 * schreibt die Antwort ohne Werkzeuge. Die Person sieht von der Prosa nichts.
 */

/**
 * Wie viel Text ein erzwungener Schritt vor seinem Aufruf schreiben darf. In
 * der Probe schrieb Large 4 einmal 740 Zeichen und rief DANN doch ein
 * Werkzeug; die Schleifen hatten nach ihrem ersten Absatz (~300–600 Zeichen)
 * noch keinen Aufruf und kamen auch später keinem näher.
 */
export const FORCED_STEP_PROSE_BUDGET = 800;

export class ForcedStepProseError extends Error {
  constructor(readonly chars: number) {
    super(`forced tool step streamed ${chars} chars of prose without a tool call`);
    this.name = 'ForcedStepProseError';
  }
}

type StreamPart = { type: string; text?: string };

/** Teile, an denen sich der Schritt entschieden hat: ein Aufruf beginnt, oder
 *  der Schritt (bzw. der Strom) endet. Danach geht der Rückhalt los. */
const RELEASE_PARTS = new Set(['tool-input-start', 'tool-call', 'finish-step', 'finish', 'error']);

/**
 * Hält den Text erzwungener Schritte zurück (siehe Dateikopf).
 *
 * `isForcedStep` wird bei jedem `start-step` gelesen; `prepareStep` läuft vor
 * dem Schritt und hat den Wert dann schon gesetzt.
 *
 * Statt jedes zurückgehaltenen Deltas geht ein `held-text`-Teil weiter: der
 * Leser zählt jeden Teil als Lebenszeichen, sonst hielte er einen schreibenden
 * Schritt für einen verstummten.
 */
export function holdForcedStepProse<P extends StreamPart>(
  stream: AsyncIterable<P>,
  isForcedStep: () => boolean,
  budget: number = FORCED_STEP_PROSE_BUDGET
): AsyncIterable<P> {
  return {
    async *[Symbol.asyncIterator]() {
      let held: P[] | null = null;
      let heldChars = 0;
      for await (const part of stream) {
        if (part.type === 'start-step') {
          held = isForcedStep() ? [] : null;
          heldChars = 0;
          yield part;
          continue;
        }
        if (held == null) {
          yield part;
          continue;
        }
        if (part.type === 'text-delta') {
          held.push(part);
          heldChars += part.text?.length ?? 0;
          if (heldChars > budget) throw new ForcedStepProseError(heldChars);
          yield { type: 'held-text' } as P;
          continue;
        }
        if (RELEASE_PARTS.has(part.type)) {
          const release = held;
          held = null;
          yield* release;
        }
        yield part;
      }
    },
  };
}
