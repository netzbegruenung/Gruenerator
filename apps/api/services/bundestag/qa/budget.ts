import {
  GEMMA_31B_ON_CORTECS,
  GEMMA_31B_ON_MELIOUS,
  GEMMA_31B_ON_MELIOUS_SPEED,
} from '../../ai/gemmaHosts.js';

/**
 * Feste Grenzen des Bundestag-Q&A. Alle Zahlen stehen hier und nirgends sonst,
 * damit Plan, Lesen und Antwort dieselben Budgets sehen.
 */

/**
 * Kontextfenster (Tokens) der Modelle, die `bundestag_read` bedienen kann. Die Zahlen
 * kommen aus `gemmaHosts.ts`, nicht aus einer zweiten Behauptung hier; ein Modell ohne Zeile
 * fällt auf die kleine Vorgabe — ein Lane-Wechsel macht die Fenster also kleiner, nie zu groß,
 * und `budget.vitest.ts` hält fest, dass die Lane selbst eine Zeile hat.
 */
export const READ_CONTEXT_TOKENS_BY_MODEL: Record<string, number> = {
  [GEMMA_31B_ON_MELIOUS_SPEED.model]: GEMMA_31B_ON_MELIOUS_SPEED.contextWindow,
  [GEMMA_31B_ON_MELIOUS.model]: GEMMA_31B_ON_MELIOUS.contextWindow,
  [GEMMA_31B_ON_CORTECS.model]: GEMMA_31B_ON_CORTECS.contextWindow,
  // Nur für den Modellvergleich (`target`); die alte Annahme war 800k Zeichen bei 4 Zeichen/Token.
  'kolibri-1': 200_000,
  'gemma-4-26b-a4b': 200_000,
};

/** Wie die Lane `balanced` (FI-Knoten): lieber zu klein als zu groß. */
const READ_CONTEXT_TOKENS_DEFAULT = 40_000;

/** Ausgabe-Reserve des Leseaufrufs (`maxOutputTokens` in `read.ts`). */
export const READ_MAX_OUTPUT_TOKENS = 8_000;
/** System-Prompt, Frage und Dokumentkopf; dazu der Spielraum für die Schätzung. */
const READ_PROMPT_OVERHEAD_TOKENS = 6_000;
/**
 * Obergrenze je Fenster, unabhängig vom Kontext: gleiche Latenz wie vor #5581 (60k Tokens ≈
 * 240k Zeichen Prosa, ~10 s auf `:speed`), und die Schätzung darf um das Doppelte falsch liegen,
 * ohne dass das Fenster über das Kontextfenster geht.
 */
const READ_WINDOW_TOKEN_TARGET = 60_000;

export function readContextTokens(model: string): number {
  return READ_CONTEXT_TOKENS_BY_MODEL[model] ?? READ_CONTEXT_TOKENS_DEFAULT;
}

/** Tokens, die ein Fenster dieses Modells höchstens belegen darf. */
export function readWindowTokens(model: string): number {
  return Math.min(
    READ_WINDOW_TOKEN_TARGET,
    readContextTokens(model) - READ_MAX_OUTPUT_TOKENS - READ_PROMPT_OVERHEAD_TOKENS
  );
}

/**
 * Konservative Token-Schätzung ohne Tokenizer (keiner ist installiert). Gemessen (Gemma auf
 * Melious, 09.11.2026): Prosa ~3,5–4 Zeichen/Token, die Tabellen von 21/7968 ~1,5. Darum je
 * Zeichenklasse: Buchstaben dicht, Ziffern und Satzzeichen etwa ein Token je Zeichen, Leerraum
 * fast gratis. Tabellenzeilen („Berlin | 12.345 | 2,3 %") landen so bei ~1,6 Zeichen/Token,
 * Prosa bei ~3,6.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 10 || c === 9 || c === 13) tokens += 0.2;
    else if ((c >= 48 && c <= 57) || c < 65 || (c > 90 && c < 97) || (c > 122 && c < 128))
      tokens += 1;
    else tokens += 0.28;
  }
  return Math.ceil(tokens);
}

export const MAX_WINDOWS_PER_DOC = 3;
export const READ_CONCURRENCY = 4;
/** PDF-Rückfälle laden bis zu 30 MB je Datei in den Arbeitsspeicher; mehr als ein paar gleichzeitig sprengen den Cluster-Worker. */
export const PDF_FALLBACK_CONCURRENCY = 3;
export const MAX_POINTS_PER_WINDOW = 6;
export const MAX_ANSWER_POINTS = 40;

export interface Budget {
  maxDocuments: number;
  maxReadChars: number;
  deadlineMs: number;
}

export const ENDPOINT_BUDGET: Budget = {
  maxDocuments: 12,
  maxReadChars: 1_500_000,
  deadlineMs: 150_000,
};

export const CHAT_BUDGET: Budget = {
  maxDocuments: 6,
  maxReadChars: 600_000,
  deadlineMs: 70_000,
};

/** Untergrenze für den Antwort-Aufruf, auch wenn die Frist des Endpunkts beim Lesen aufgebraucht wurde. */
export const ANSWER_MIN_TIMEOUT_MS = 15_000;

/** Eine Woche. */
export const TEXT_CACHE_TTL_S = 604_800;
export const PDF_MAX_BYTES = 30 * 1024 * 1024;

/** Lässt höchstens `limit` Aufgaben gleichzeitig laufen. */
export function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
