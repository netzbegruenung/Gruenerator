/**
 * `reason` is the rejection as thrown — an HttpStatusError keeps its status,
 * which gone detection needs and the message alone does not carry.
 */
export type BatchOutcome<T, R> =
  { item: T; result: R } | { item: T; error: string; reason: unknown };

/**
 * Batch-parallel execution utility for scrapers.
 * Runs `fn` on items in batches of `concurrency` using Promise.allSettled,
 * with a delay between batches to be polite to the target server.
 */
export async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Array<BatchOutcome<T, R>>> {
  const { concurrency = 5, delayMs = 300 } = options;
  const output: Array<BatchOutcome<T, R>> = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((item) => fn(item)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const item = batch[j];
      if (r.status === 'fulfilled') {
        output.push({ item, result: r.value });
      } else {
        output.push({
          item,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          reason: r.reason,
        });
      }
    }

    if (i + concurrency < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return output;
}
