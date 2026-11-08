import { beforeEach, describe, expect, it, vi } from 'vitest';

// A plain stub, not vi.fn: with vi.fn + mockReset the rejection in the last
// case surfaced as a second, unhandled error although the tool catches it
// (observed 07.11.2026, cause not pinned down).
const calls: unknown[][] = [];
let impl: (...args: unknown[]) => Promise<unknown> = async () => null;
const planAndCompute = {
  mockResolvedValue: (v: unknown) => (impl = async () => v),
  mockImplementation: (f: (...args: unknown[]) => Promise<unknown>) => (impl = f),
  mockReset: () => {
    calls.length = 0;
    impl = async () => null;
  },
};
vi.mock('../../../agents/langgraph/ChatGraph/nodes/computeNode.js', () => ({
  planAndCompute: (...args: unknown[]) => {
    calls.push(args);
    return impl(...args);
  },
}));

const { makeRechnenTool } = await import('./rechnenTool.js');

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

function setup() {
  const state = {} as ChatGraphState;
  const sent: { event: string; data: unknown }[] = [];
  const sse = {
    send: (event: string, data: unknown) => sent.push({ event, data }),
  } as unknown as SSEWriter;
  const t = makeRechnenTool({ state, sse }) as unknown as {
    execute: (input: { auftrag: string; text?: string }, opts: unknown) => Promise<unknown>;
  };
  return { state, sent, run: (input: { auftrag: string; text?: string }) => t.execute(input, {}) };
}

const RESULT = {
  operation: '20 % von 340',
  entries: [{ label: 'Ergebnis', value: '68' }],
  summary: '20 % von 340 sind 68.',
};

describe('rechnen', () => {
  beforeEach(() => planAndCompute.mockReset());

  it('shows the computed card and hands the exact values to the model', async () => {
    planAndCompute.mockResolvedValue({ result: RESULT, operation: 'arithmetic' });
    const { state, sent, run } = setup();

    const out = (await run({ auftrag: '20 % von 340' })) as Record<string, unknown>;

    expect(calls).toEqual([['Anfrage: "20 % von 340"', '20 % von 340']]);
    expect(state.computedResult).toEqual(RESULT);
    expect(state.computedResultFresh).toBe(true);
    expect(sent).toEqual([{ event: 'compute', data: { compute: RESULT } }]);
    expect(out.ok).toBe(true);
    expect(out.ergebnis).toEqual(['Ergebnis: 68']);
  });

  it('counts against the handed-over text, not the order', async () => {
    planAndCompute.mockResolvedValue({ result: RESULT, operation: 'text_metrics' });
    const { run } = setup();

    await run({ auftrag: 'Zähle die Zeichen', text: 'Mehr Radwege jetzt' });

    expect(calls).toEqual([
      ['Anfrage: "Zähle die Zeichen"\n\nText:\nMehr Radwege jetzt', 'Mehr Radwege jetzt'],
    ]);
  });

  it('returns an error and no card when nothing is computable', async () => {
    planAndCompute.mockResolvedValue({ result: null, operation: 'unsupported' });
    const { state, sent, run } = setup();

    const out = (await run({ auftrag: 'Wie wird die Wahl ausgehen?' })) as Record<string, unknown>;

    expect(out.error).toMatch(/Keine sichere Berechnung/);
    expect(state.computedResult).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('turns a failed model call into an error the model must not paper over', async () => {
    planAndCompute.mockImplementation(async () => {
      throw new Error('upstream 503');
    });
    const { sent, run } = setup();

    const out = (await run({ auftrag: '3 * 4' })) as Record<string, unknown>;

    expect(out.error).toMatch(/Nenne keine eigene Zahl/);
    expect(sent).toEqual([]);
  });
});
