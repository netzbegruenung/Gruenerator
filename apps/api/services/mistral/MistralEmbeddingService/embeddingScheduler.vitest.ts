import { describe, it, expect, beforeEach } from 'vitest';

import {
  scheduleEmbedding,
  embeddingSchedulerStats,
  _resetEmbeddingSchedulerForTests,
} from './embeddingScheduler.js';

/** Ein Promise, das von außen aufgelöst wird — hält eine Aufgabe im Platz fest. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('embeddingScheduler', () => {
  beforeEach(() => {
    _resetEmbeddingSchedulerForTests();
  });

  it('lässt nie mehr als die Prozessgrenze gleichzeitig laufen', async () => {
    const { maxActive } = embeddingSchedulerStats();
    const gates = Array.from({ length: maxActive + 5 }, () => deferred());
    let running = 0;
    let peak = 0;

    const all = gates.map((gate) =>
      scheduleEmbedding('bulk', async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
      })
    );

    await flush();
    expect(peak).toBe(maxActive);

    for (const gate of gates) gate.resolve();
    await Promise.all(all);
    expect(peak).toBe(maxActive);
  });

  it('teilt die Grenze über getrennte Aufrufe hinweg', async () => {
    // Der eigentliche Zweck: früher hatte JEDER generateBatchEmbeddings-Aufruf
    // sein eigenes parallelLimit(3), zwei Uploads liefen also mit 6.
    const { maxActive } = embeddingSchedulerStats();
    const gates = Array.from({ length: maxActive * 2 }, () => deferred());

    const jobA = gates
      .slice(0, maxActive)
      .map((g) => scheduleEmbedding('bulk', () => g.promise.then(() => 'a')));
    const jobB = gates
      .slice(maxActive)
      .map((g) => scheduleEmbedding('bulk', () => g.promise.then(() => 'b')));

    await flush();
    expect(embeddingSchedulerStats().active).toBe(maxActive);
    expect(embeddingSchedulerStats().queued).toBe(maxActive);

    for (const gate of gates) gate.resolve();
    await Promise.all([...jobA, ...jobB]);
    expect(embeddingSchedulerStats().active).toBe(0);
  });

  it('bedient eine Suchanfrage vor wartender Massen-Indizierung', async () => {
    const { maxActive } = embeddingSchedulerStats();
    const blockers = Array.from({ length: maxActive }, () => deferred());
    const order: string[] = [];

    const held = blockers.map((g) => scheduleEmbedding('bulk', () => g.promise));
    await flush();

    const bulk = scheduleEmbedding('bulk', async () => {
      order.push('bulk');
    });
    const interactive = scheduleEmbedding('interactive', async () => {
      order.push('interactive');
    });
    await flush();

    // Beide warten — die Plätze sind belegt.
    expect(order).toEqual([]);

    for (const g of blockers) g.resolve();
    await Promise.all([...held, bulk, interactive]);

    expect(order[0]).toBe('interactive');
  });

  it('gibt den Platz auch frei, wenn die Aufgabe wirft', async () => {
    await expect(
      scheduleEmbedding('bulk', () => Promise.reject(new Error('kaputt')))
    ).rejects.toThrow('kaputt');
    expect(embeddingSchedulerStats().active).toBe(0);

    await expect(scheduleEmbedding('bulk', async () => 'geht wieder')).resolves.toBe('geht wieder');
  });
});
