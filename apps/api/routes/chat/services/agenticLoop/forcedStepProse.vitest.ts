import { describe, expect, it } from 'vitest';

import { ForcedStepProseError, holdForcedStepProse } from './forcedStepProse.js';

type Part = { type: string; text?: string };

async function collect(parts: Part[], forced: boolean[], budget = 20): Promise<Part[]> {
  let step = -1;
  const source = (async function* () {
    for (const part of parts) {
      if (part.type === 'start-step') step++;
      yield part;
    }
  })();
  const out: Part[] = [];
  for await (const part of holdForcedStepProse(source, () => forced[step] ?? false, budget)) {
    out.push(part);
  }
  return out;
}

const texts = (parts: Part[]) =>
  parts
    .filter((p) => p.type === 'text-delta')
    .map((p) => p.text)
    .join('');

describe('holdForcedStepProse', () => {
  it('passes a free step through untouched', async () => {
    const parts = [
      { type: 'start-step' },
      { type: 'text-delta', text: 'a'.repeat(100) },
      { type: 'finish-step' },
    ];
    expect(await collect(parts, [false])).toEqual(parts);
  });

  it('holds a short preamble on a forced step and releases it with the call, in order', async () => {
    const out = await collect(
      [
        { type: 'start-step' },
        { type: 'text-delta', text: 'Ich suche ' },
        { type: 'text-delta', text: 'kurz.' },
        { type: 'tool-call' },
        { type: 'finish-step' },
      ],
      [true]
    );
    expect(out.map((p) => p.type)).toEqual([
      'start-step',
      'held-text',
      'held-text',
      'text-delta',
      'text-delta',
      'tool-call',
      'finish-step',
    ]);
    expect(texts(out)).toBe('Ich suche kurz.');
  });

  it('releases held text when a forced step ends without a call (the SDK then reports the violation)', async () => {
    const out = await collect(
      [{ type: 'start-step' }, { type: 'text-delta', text: 'kurz' }, { type: 'finish-step' }],
      [true]
    );
    expect(texts(out)).toBe('kurz');
  });

  it('aborts a forced step whose prose outgrows the budget before any of it is released', async () => {
    const released: Part[] = [];
    const source = (async function* () {
      yield { type: 'start-step' };
      // A model that cannot stop: never a call, never a step end.
      while (true) yield { type: 'text-delta', text: 'Ich höre jetzt auf. ' };
    })();
    await expect(async () => {
      for await (const part of holdForcedStepProse(source, () => true, 50)) released.push(part);
    }).rejects.toBeInstanceOf(ForcedStepProseError);
    expect(texts(released)).toBe('');
  });

  it('only holds the forced step, not the free steps after it', async () => {
    const out = await collect(
      [
        { type: 'start-step' },
        { type: 'tool-call' },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text-delta', text: 'x'.repeat(100) },
        { type: 'finish-step' },
      ],
      [true, false]
    );
    expect(texts(out)).toBe('x'.repeat(100));
    expect(out.some((p) => p.type === 'held-text')).toBe(false);
  });
});
