/**
 * Höflichkeit gegenüber einer Parlamentsdokumentation: alle Anfragen laufen
 * nacheinander durch ein Gatter mit Mindestabstand; parallel sind nur Auslesen,
 * Einbetten und Upsert (`runPool`).
 */

/** Reiht Aufgaben hintereinander und hält zwischen ihnen einen Mindestabstand. */
export class PoliteGate {
  #tail: Promise<unknown> = Promise.resolve();
  #last = 0;

  constructor(private readonly gapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(async () => {
      const wait = this.#last + this.gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        this.#last = Date.now();
      }
    });
    this.#tail = next.catch(() => undefined);
    return next;
  }
}

/** `fn` über `items`, höchstens `limit` gleichzeitig. */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
