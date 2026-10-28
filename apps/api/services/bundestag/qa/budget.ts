/**
 * Feste Grenzen des Bundestag-Q&A. Alle Zahlen stehen hier und nirgends sonst,
 * damit Plan, Lesen und Antwort dieselben Budgets sehen.
 */

/** Zeichen, die ein Leselauf pro Fenster sieht. Nachgeschlagen am Modell der Lane `bundestag_read`, damit ein Lane-Wechsel das Fenster mitnimmt. */
export const READ_WINDOW_CHARS_BY_MODEL: Record<string, number> = {
  'gemma-4-31b-it': 240_000,
  'kolibri-1': 800_000,
  'gemma-4-26b-a4b': 800_000,
};

const READ_WINDOW_CHARS_DEFAULT = 240_000;

export function readWindowChars(model: string): number {
  return READ_WINDOW_CHARS_BY_MODEL[model] ?? READ_WINDOW_CHARS_DEFAULT;
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
