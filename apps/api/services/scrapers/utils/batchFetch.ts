/**
 * Batch-parallel execution utility for scrapers.
 * Runs `fn` on items in batches of `concurrency` using Promise.allSettled,
 * with a delay between batches to be polite to the target server.
 */
export async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Array<{ item: T; result: R } | { item: T; error: string }>> {
  const { concurrency = 5, delayMs = 300 } = options;
  const output: Array<{ item: T; result: R } | { item: T; error: string }> = [];

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
        });
      }
    }

    if (i + concurrency < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return output;
}
