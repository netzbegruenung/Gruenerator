import { describe, it, expect, vi } from 'vitest';

import {
  runAgenticLoop,
  buildPrepareStep,
  FORCE_FINISH_SYSTEM_SUFFIX,
  FORCE_FINISH_GATHER_SUFFIX,
  type LoopDeps,
  type LoopEngineParams,
} from './loopEngine.js';

describe('buildPrepareStep — forceFirstToolCall', () => {
  const never = () => false;
  it('requires a tool call on step 0 when forced', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, true);
    expect(prep({ stepNumber: 0 })).toEqual({ toolChoice: 'required' });
    // later steps go back to auto (no override)
    expect(prep({ stepNumber: 1 })).toEqual({});
  });

  it('does not force when the flag is off', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    expect(prep({ stepNumber: 0 })).toEqual({});
  });

  it('force-finish still wins over force-first on the last step', () => {
    const prep = buildPrepareStep('sys', 'SUFF', 1, never, true);
    // maxSteps=1 → step 0 is the last step → toolChoice:'none' + finish system
    expect(prep({ stepNumber: 0 })).toEqual({ toolChoice: 'none', system: 'sysSUFF' });
  });
});

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

  it('runs the afterGather guarantee AFTER the stream (compound artifact net)', async () => {
    const afterGather = vi.fn(async () => {});
    const deps: LoopDeps = {
      streamText: (() =>
        streamOf([{ type: 'text-delta', text: 'A' }])) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    await runAgenticLoop(baseParams({ mode: 'unified', afterGather }), deps);
    // Regression: afterGather never fired in unified mode, so a compound sharepic
    // turn that only searched left the artifact uncreated.
    expect(afterGather).toHaveBeenCalledTimes(1);
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
      streamText: (() =>
        streamOf([{ type: 'text-delta', text: 'A' }])) as unknown as LoopDeps['streamText'],
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

describe('runAgenticLoop — force-finish (prepareStep)', () => {
  type PrepareStep = (a: { stepNumber: number }) => { toolChoice?: string; system?: string };

  function capturePrepareStep(mode: 'unified' | 'split', params: Partial<LoopEngineParams>) {
    let streamPrepare: PrepareStep | undefined;
    let genPrepare: PrepareStep | undefined;
    const deps: LoopDeps = {
      streamText: ((o: StreamOpts & { prepareStep?: PrepareStep }) => {
        streamPrepare ??= o.prepareStep;
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: ((o: GenOpts & { prepareStep?: PrepareStep }) => {
        genPrepare = o.prepareStep;
        return Promise.resolve({ text: '' });
      }) as unknown as LoopDeps['generateText'],
    };
    const run = runAgenticLoop(baseParams({ mode, ...params }), deps);
    return { run, prepare: () => (mode === 'unified' ? streamPrepare : genPrepare) };
  }

  it('unified: last step strips tools AND injects the finish instruction', async () => {
    const { run, prepare } = capturePrepareStep('unified', { maxSteps: 6 });
    await run;
    const p = prepare();
    expect(p).toBeDefined();
    // Early steps: untouched.
    expect(p!({ stepNumber: 0 })).toEqual({});
    expect(p!({ stepNumber: 4 })).toEqual({});
    // Final step: toolChoice none + explicit "answer now" system override.
    const final = p!({ stepNumber: 5 });
    expect(final.toolChoice).toBe('none');
    expect(final.system).toContain('TOOLSYS');
    expect(final.system).toContain(FORCE_FINISH_SYSTEM_SUFFIX.trim().slice(0, 20));
  });

  it('unified: forceFinish() trips the finish instruction on ANY step (e.g. image generated)', async () => {
    let generated = false;
    const { run, prepare } = capturePrepareStep('unified', {
      maxSteps: 6,
      forceFinish: () => generated,
    });
    await run;
    const p = prepare()!;
    expect(p({ stepNumber: 1 })).toEqual({});
    generated = true;
    const forced = p({ stepNumber: 1 });
    expect(forced.toolChoice).toBe('none');
    expect(forced.system).toContain(FORCE_FINISH_SYSTEM_SUFFIX.trim().slice(0, 20));
  });

  it('split gather: finish override keeps the GATHER system (incl. strategy block) + gather suffix', async () => {
    const { run, prepare } = capturePrepareStep('split', { maxSteps: 4 });
    await run;
    const final = prepare()!({ stepNumber: 3 });
    expect(final.toolChoice).toBe('none');
    // The override must extend the gather system, not replace it with the bare tool system.
    expect(final.system).toContain('TOOLSYS');
    expect(final.system).toContain('ARBEITSPHASE');
    expect(final.system).toContain(FORCE_FINISH_GATHER_SUFFIX.trim().slice(0, 20));
    expect(final.system).not.toContain(FORCE_FINISH_SYSTEM_SUFFIX.trim().slice(-30));
  });

  it('split synthesis has NO prepareStep (no tools to strip)', async () => {
    let synthHadPrepare: boolean | null = null;
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({ text: '' })) as unknown as LoopDeps['generateText'],
      streamText: ((o: { prepareStep?: unknown }) => {
        synthHadPrepare = o.prepareStep != null;
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
    };
    await runAgenticLoop(baseParams({ mode: 'split' }), deps);
    expect(synthHadPrepare).toBe(false);
  });

  it('maxSteps=1 force-finishes immediately (degenerate budget still answers)', async () => {
    const { run, prepare } = capturePrepareStep('unified', { maxSteps: 1 });
    await run;
    const first = prepare()!({ stepNumber: 0 });
    expect(first.toolChoice).toBe('none');
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

    await expect(
      runAgenticLoop(baseParams({ mode: 'unified', onReasoning }), deps)
    ).rejects.toThrow('stream fail');
    expect(onReasoning).toHaveBeenCalledWith('denke nach');
  });
});
