/**
 * Der Antwort-Sender eines Turns: alles, was der Loop AUSSERHALB von
 * `wrapToolsForLoop` über SSE hinausschickt, plus der Text, der dabei entsteht.
 *
 * Als EIN Objekt, weil `text` und das `response_start`-Latch zusammengehören:
 * jeder Weg, der Antworttext sendet, öffnet die Antwort genau einmal. Bis zum
 * Abbau des Split-Modus (11/2026, #5441) hielt dieses Objekt auch die Erzählung
 * des Planers und den Eröffnungssatz; die gibt es im Unified-Loop nicht.
 *
 * NICHT hier: der Karten-Lebenszyklus der Werkzeuge (`tool_step_start`/
 * `tool_step_result`). Der bleibt in `wrapTools.ts` — §4.6 des
 * Architekturpapiers hat sein Herauslösen geprüft und verworfen.
 *
 * Pro Turn EINE Instanz. Kein Modul-Zustand — Turns laufen parallel.
 */
import { PROGRESS_MESSAGES, type SSEWriter } from '../sseHelpers.js';

export interface AnswerEmitter {
  /** Everything streamed as answer text so far. */
  readonly text: string;
  startResponse(): void;
  /** An answer delta from the model. */
  pushAnswer(delta: string): void;
  /** Append text and stream it as-is (notes, abort suffixes). Does NOT open the
   *  response — the callers that need that call `replaceAndStream`. */
  appendAndStream(delta: string): void;
  /** Discard whatever was streamed and put `text` in its place, streamed as one
   *  delta. Used where the streamed text was whitespace-only or an abort stump
   *  the client must not keep. */
  replaceAndStream(text: string): void;
  /** Swap the text without streaming — a `completion` event follows. */
  setText(text: string): void;
}

export function createAnswerEmitter(sse: SSEWriter): AnswerEmitter {
  let text = '';
  let responseStarted = false;

  const startResponse = (): void => {
    if (responseStarted) return;
    responseStarted = true;
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
  };

  return {
    get text() {
      return text;
    },
    startResponse,
    pushAnswer: (delta) => {
      startResponse();
      text += delta;
      sse.send('text_delta', { text: delta });
    },
    appendAndStream: (delta) => {
      text += delta;
      sse.send('text_delta', { text: delta });
    },
    replaceAndStream: (next) => {
      text = next;
      startResponse();
      sse.send('text_delta', { text: next });
    },
    setText: (next) => {
      text = next;
    },
  };
}
