/**
 * Werkzeug-Aufruf-IDs, die auf der Leitung gültig sind.
 *
 * mistral-common — der Validator hinter der Mistral-API UND hinter GreenPTs
 * Mistral-Lanes — verlangt für jede `tool_call_id` **genau neun Zeichen aus
 * [a-zA-Z0-9]**. Alles andere ist ein 400, bevor das Modell die Anfrage sieht:
 *
 *   400 Tool call id was 0540141_3 but must be a-z, A-Z, 0-9, with a length of 9
 *
 * (GreenPTs Monitoring, gemeldet 24.08.2026.) Die gemeldete ID ist der
 * Neun-Zeichen-Schwanz von `tc_1787000540141_3` — der Bauform, mit der
 * `postResponseService` die Werkzeug-Aufrufe eines Single-Pass-Zuges
 * persistiert. Der Weg zurück auf die Leitung geht über den Wiederabspieler:
 * `getRecentToolSteps` liest genau diese Einträge und
 * `buildToolObservationReplay` macht daraus echte tool-call/tool-result-
 * Nachrichten für den nächsten Zug.
 *
 * Es ist nicht die einzige Quelle, und das ist der Grund, warum die Reparatur
 * hier sitzt und nicht an den Prägestellen:
 *
 *  - persistierte IDs aus Zügen, die vor dieser Änderung liefen (`tc_…`,
 *    `forced-edit`, `mcp-…`) — die stehen in der Datenbank und ändern sich nie;
 *  - IDs, die ein ANDERER Anbieter geprägt hat (litellm/regolo geben
 *    `call_<24 Zeichen>`), und die die Ausweichkette mitten im Zug auf eine
 *    Mistral-Lane trägt;
 *  - IDs aus dem Verlauf, den der Client zurückschickt.
 *
 * Deshalb: eine Hülle um das Modell, unbedingt für **alle** Lanes. Neun
 * alphanumerische Zeichen sind auf jedem OpenAI-kompatiblen Endpunkt gültig, es
 * gibt also keinen Anbieter, für den die Umschrift schadet — und eine Weiche
 * „nur für Mistral" wäre genau die Stelle, an der die nächste Ausweichkette
 * vorbeiläuft.
 *
 * Die Umschrift ist deterministisch (SHA-256 → Base62), also über Anfragen und
 * Züge hinweg stabil: derselbe Aufruf trägt in jeder Anfrage dieselbe
 * Leitungs-ID, und Aufruf und Ergebnis finden sich zueinander. Nach innen
 * ändert sich nichts — Persistenz, SSE und UI führen weiter die ursprüngliche
 * ID, umgeschrieben wird ausschliesslich der Prompt kurz vor dem Absenden.
 */

import { createHash } from 'node:crypto';

import { wrapLanguageModel } from 'ai';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

/** Was mistral-common akzeptiert. */
const WIRE_ID = /^[a-zA-Z0-9]{9}$/;

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const WIRE_ID_LENGTH = 9;

/**
 * Die Leitungs-ID zu einer beliebigen internen Werkzeug-Aufruf-ID.
 * Bereits gültige IDs bleiben unangetastet — die überwiegende Mehrheit, denn
 * die Modelle selbst prägen konforme IDs.
 */
export function toWireToolCallId(id: string): string {
  if (WIRE_ID.test(id)) return id;
  const digest = createHash('sha256').update(id).digest();
  let out = '';
  for (let i = 0; i < WIRE_ID_LENGTH; i += 1) out += BASE62[digest[i] % BASE62.length];
  return out;
}

/** Trägt der Prompt-Teil eine Werkzeug-Aufruf-ID? Strukturell geprüft, weil
 *  dieselbe Hülle über Modelle der Spec-Versionen V2–V4 liegt. */
function hasToolCallId(part: unknown): part is { toolCallId: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    typeof (part as { toolCallId?: unknown }).toolCallId === 'string'
  );
}

/**
 * Prompt-Kopie, in der jede Werkzeug-Aufruf-ID leitungsfähig ist.
 * Kopiert nur, was sie anfasst; Nachrichten ohne Werkzeug-Teile gehen
 * unverändert durch.
 */
export function withWireToolCallIds<T>(prompt: readonly T[]): T[] {
  return prompt.map((message) => {
    const content = (message as { content?: unknown }).content;
    // `Array.isArray` verengt `unknown` auf `any[]`; ohne die Annotation
    // unten wandert dieses `any` durch `map` in den Rückgabewert.
    if (!Array.isArray(content)) return message;
    const parts: unknown[] = content;
    let touched = false;
    const next = parts.map((part) => {
      if (!hasToolCallId(part)) return part;
      const wire = toWireToolCallId(part.toolCallId);
      if (wire === part.toolCallId) return part;
      touched = true;
      return { ...part, toolCallId: wire };
    });
    return touched ? ({ ...message, content: next } as T) : message;
  });
}

/**
 * Modell-Hülle, die den Prompt kurz vor dem Absenden umschreibt.
 * Ein blosser String-Modellbezeichner hat keinen Haken zum Umhüllen und geht
 * durch — dieselbe Verengung wie in `withUsageTracking`.
 */
export function withWireSafeToolCallIds(model: LanguageModel): LanguageModel {
  if (typeof model === 'string') return model;

  const middleware: LanguageModelMiddleware = {
    transformParams: ({ params }) =>
      Promise.resolve({ ...params, prompt: withWireToolCallIds(params.prompt) }),
  };

  return wrapLanguageModel({ model, middleware });
}
