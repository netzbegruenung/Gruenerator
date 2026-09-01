/**
 * Der Antwort-Sender eines Turns: alles, was der Loop AUSSERHALB von
 * `wrapToolsForLoop` über SSE hinausschickt, plus der Text, der dabei entsteht.
 *
 * Warum als EIN Objekt und nicht als fünf Funktionen: `text`, der
 * Eröffnungssatz, der Erzähl-Puffer, das `response_start`-Latch und der
 * Synth-Herzschlag hängen voneinander ab. Der Herzschlag endet, sobald echter
 * Text kommt; die Eröffnung wird beim ERSTEN Werkzeugstart nachgereicht und
 * schaltet dabei denselben Herzschlag ab; die Dedupe liest den Eröffnungssatz
 * über einen Getter, weil er erst während der Sammelphase gesetzt wird. Als
 * lose Funktionen mit geteilten Closure-Variablen war das genau die Verflechtung,
 * die den Orchestrator unlesbar machte.
 *
 * NICHT hier: der Karten-Lebenszyklus der Werkzeuge (`tool_step_start`/
 * `tool_step_result`). Der bleibt in `wrapTools.ts` — §4.6 des
 * Architekturpapiers hat sein Herauslösen geprüft und verworfen. Dieses Modul
 * bündelt ausschließlich, was heute schon außerhalb des Wrappers liegt.
 *
 * Pro Turn EINE Instanz. Kein Modul-Zustand — Turns laufen parallel.
 */
import { PROGRESS_MESSAGES, type SSEWriter } from '../sseHelpers.js';

import { createOpeningDedupe } from './openingDedupe.js';

export interface AnswerEmitter {
  /** Everything streamed as answer text so far. */
  readonly text: string;
  /** The gather phase's first narrated sentence, or null if it never narrated. */
  readonly openingSentence: string | null;
  /** Whether that sentence actually reached the client. Only a SHOWN opening
   *  must not be restated — the synth prompt and the dedupe both key on this. */
  readonly openingEmitted: boolean;
  startResponse(): void;
  /** An answer delta from the model — runs through the opening dedupe. */
  pushAnswer(delta: string): void;
  /** Release whatever the dedupe still holds. */
  flush(): void;
  /** Append text and stream it as-is (notes, abort suffixes). Does NOT open the
   *  response — the callers that need that call `replaceAndStream`. */
  appendAndStream(delta: string): void;
  /** Discard whatever was streamed and put `text` in its place, streamed as one
   *  delta. Used where the streamed text was whitespace-only or an abort stump
   *  the client must not keep. */
  replaceAndStream(text: string): void;
  /** Swap the text without streaming — a `completion` event follows. */
  setText(text: string): void;
  /** Split-gather narration, one sentence at a time. */
  handleNarration(sentence: string): void;
  /** Drains the narration buffer for the tool card about to start — and emits
   *  the held-back opening, because this IS the moment a tool actually runs. */
  takeNarration(): string | null;
  /** The forced-generation path is "a tool actually runs" too. */
  emitOpeningBeforeTool(): void;
}

export function createAnswerEmitter(sse: SSEWriter): AnswerEmitter {
  let text = '';
  // Planner narration sentences buffered since the last tool call started, so
  // wrapTools can drain + associate them with the tool they announced. Split
  // mode only; unified narration flows through the answer text via onText.
  const narrationBuffer: string[] = [];
  // Split mode's FIRST narration sentence — the model's stated plan, per
  // GATHER_SUFFIX's instruction to name the whole set of intended artifacts up
  // front — crosses into the real answer text as soon as a tool ACTUALLY runs,
  // so it appears as message prose before the first tool card. Held back until
  // then on purpose: on a steps=0 turn the "plan" announces work that never
  // happens, and the synth then writes the whole answer anyway — streaming it
  // there was pure duplication surface.
  // Both stay null/false in unified mode (no onNarration there) and on any
  // turn where the model never narrated.
  let openingSentence: string | null = null;
  let openingEmitted = false;
  let responseStarted = false;

  const startResponse = (): void => {
    if (responseStarted) return;
    responseStarted = true;
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
  };

  const emitOpeningBeforeTool = (): void => {
    if (openingSentence == null || openingEmitted) return;
    openingEmitted = true;
    startResponse();
    text += `${openingSentence} `;
    sse.send('text_delta', { text: `${openingSentence} ` });
  };

  const emitAnswerDelta = (delta: string): void => {
    startResponse();
    text += delta;
    sse.send('text_delta', { text: delta });
  };

  // Deterministic guard for the opening-sentence invariant (see openingDedupe):
  // the prompt tells the synth the opening is already on screen, this enforces
  // it when the model restates it anyway. `openingSentence` is read via getter
  // because it is only assigned once the gather phase narrates.
  const answerDedupe = createOpeningDedupe(
    () => (openingEmitted ? openingSentence : null),
    emitAnswerDelta
  );

  return {
    get text() {
      return text;
    },
    get openingSentence() {
      return openingSentence;
    },
    get openingEmitted() {
      return openingEmitted;
    },
    startResponse,
    pushAnswer: (delta) => answerDedupe.push(delta),
    flush: () => answerDedupe.flush(),
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
    // The FIRST sentence — the model's opening plan — crosses into the real
    // answer text, but only once a tool actually starts (see
    // emitOpeningBeforeTool): a plan line on a turn that then calls no tool
    // announces nothing and only duplicates the synth's own opening. Every
    // later sentence stays on the existing side channel: buffered for the next
    // tool_step_start to stamp onto its card, and sent live on its own SSE
    // event. Repeating the opening line per tool call would be noise the tool
    // card already carries.
    handleNarration: (sentence) => {
      if (openingSentence == null) {
        openingSentence = sentence;
        return;
      }
      narrationBuffer.push(sentence);
      sse.send('gather_narration', { text: sentence });
    },
    takeNarration: () => {
      // Called at every tool START (wrapTools) — the first call is the moment
      // "a tool actually runs" becomes true, so the held-back opening streams
      // here, before the tool card it announces.
      emitOpeningBeforeTool();
      if (narrationBuffer.length === 0) return null;
      const joined = narrationBuffer.join(' ').trim();
      narrationBuffer.length = 0;
      return joined || null;
    },
    emitOpeningBeforeTool,
  };
}
