import { describe, it, expect, vi } from 'vitest';

import { runAgenticLoop, type LoopDeps, type LoopEngineParams } from './loopEngine.js';

// Fake models are opaque tags — the engine only forwards them to
// streamText/generateText, and the injected fakes read `.id` to assert which
// model drove which phase.
const plannerModel = { id: 'planner' } as unknown as LoopEngineParams['plannerModel'];
const synthModel = { id: 'synth' } as unknown as LoopEngineParams['synthModel'];

type Part = { type: string; text?: string; error?: unknown };
type StreamOpts = { model: { id: string }; tools?: Record<string, unknown>; system?: string };
type GenOpts = {
  model: { id: string };
  tools?: Record<string, { execute?: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }>;
};

function streamOf(parts: Part[]): ReturnType<LoopDeps['streamText']> {
  return {
    fullStream: (async function* () {
      yield* parts;
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

function baseParams(over: Partial<LoopEngineParams>): LoopEngineParams {
  return {
    mode: 'split',
    plannerModel,
    synthModel,
    tools: {},
    toolSystem: 'TOOLSYS',
    buildSynthSystem: (s) => `SYNTHSYS::${s}`,
    getSourcesBlock: () => '[1] Quelle — Inhalt',
    messages: [],
    maxSteps: 6,
    temperature: 0.3,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(10_000),
    forceFinish: () => false,
    onText: vi.fn(),
    onReasoning: vi.fn(),
    ...over,
  };
}

describe('runAgenticLoop — unified mode', () => {
  it('runs ONE streamText with tools on the selected model and streams its text', async () => {
    const calls: string[] = [];
    const onText = vi.fn();
    const deps: LoopDeps = {
      streamText: ((o: StreamOpts) => {
        calls.push(`streamText:${o.model.id}:tools=${!!o.tools}`);
        return streamOf([{ type: 'text-delta', text: 'UNIFIED_ANSWER' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => {
        calls.push('generateText');
        return Promise.resolve({});
      }) as unknown as LoopDeps['generateText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'unified', onText }), deps);

    expect(out.text).toBe('UNIFIED_ANSWER');
    expect(onText).toHaveBeenCalledWith('UNIFIED_ANSWER');
    // No planner phase; one streamText on the selected model WITH tools.
    expect(calls).toEqual(['streamText:synth:tools=true']);
  });
});

describe('runAgenticLoop — split (planner/executor)', () => {
  it('planner gathers (generateText+tools) then the SELECTED model synthesizes (streamText, no tools)', async () => {
    const order: string[] = [];
    const onText = vi.fn();
    let synthSystem = '';
    const deps: LoopDeps = {
      generateText: ((o: GenOpts) => {
        order.push(`gather:${o.model.id}:tools=${!!o.tools}`);
        return Promise.resolve({ text: 'PLANNER_DRAFT_DISCARDED' });
      }) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        order.push(`synth:${o.model.id}:tools=${!!o.tools}`);
        synthSystem = o.system ?? '';
        return streamOf([{ type: 'text-delta', text: 'SYNTH_ANSWER' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'split', onText }), deps);

    // The user-facing answer comes from the synth model; the planner's draft is discarded.
    expect(out.text).toBe('SYNTH_ANSWER');
    expect(onText).toHaveBeenCalledWith('SYNTH_ANSWER');
    expect(onText).not.toHaveBeenCalledWith('PLANNER_DRAFT_DISCARDED');
    // Order + which model + tools-per-phase.
    expect(order).toEqual(['gather:planner:tools=true', 'synth:synth:tools=false']);
    // Gathered sources are injected into the (tool-less) synth context.
    expect(synthSystem).toContain('[1] Quelle');
  });

  it('runs the tool loop on the planner (gather executes tools)', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: true });
    const deps: LoopDeps = {
      generateText: (async (o: GenOpts) => {
        await o.tools?.probe?.execute?.({}, { toolCallId: 'c1' });
        return { text: '' };
      }) as unknown as LoopDeps['generateText'],
      streamText: (() => streamOf([{ type: 'text-delta', text: 'A' }])) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(
      baseParams({
        mode: 'split',
        tools: { probe: { execute: probe } } as unknown as LoopEngineParams['tools'],
      }),
      deps
    );

    expect(probe).toHaveBeenCalledOnce();
  });

  it('degrades to synthesis when the gather phase errors (partial evidence still answers)', async () => {
    const deps: LoopDeps = {
      generateText: (() =>
        Promise.reject(new Error('planner boom'))) as unknown as LoopDeps['generateText'],
      streamText: (() =>
        streamOf([{ type: 'text-delta', text: 'RECOVERED' }])) as unknown as LoopDeps['streamText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'split' }), deps);

    expect(out.text).toBe('RECOVERED');
  });
});

describe('runAgenticLoop — stream draining', () => {
  it('forwards reasoning deltas and throws on an error part', async () => {
    const onReasoning = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: (() =>
        streamOf([
          { type: 'reasoning-delta', text: 'denke nach' },
          { type: 'error', error: new Error('stream fail') },
        ])) as unknown as LoopDeps['streamText'],
    };

    await expect(runAgenticLoop(baseParams({ mode: 'unified', onReasoning }), deps)).rejects.toThrow(
      'stream fail'
    );
    expect(onReasoning).toHaveBeenCalledWith('denke nach');
  });
});
