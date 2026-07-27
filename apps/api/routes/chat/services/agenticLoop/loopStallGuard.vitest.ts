import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  runAgenticLoop,
  isSynthStall,
  type LoopDeps,
  type LoopEngineParams,
} from './loopEngine.js';

/**
 * The silent-stall class. A lane accepts the request, returns a stream, and then
 * emits nothing. Before this guard the agentic loop had no first-token deadline
 * at all — the turn sat there for the full 120s wall clock with no text, no
 * error and no heartbeat, which users reported as "it just aborts". The
 * single-pass path had had this protection for a while; the loop, which the
 * tier-3.5 demotion routes most turns through, had none.
 */

const plannerModel = { id: 'planner' } as unknown as LoopEngineParams['plannerModel'];
const synthModel = { id: 'synth' } as unknown as LoopEngineParams['synthModel'];
const fallbackModel = { id: 'fallback' } as unknown as LoopEngineParams['synthModel'];

type Part = { type: string; text?: string };

function streamOf(parts: Part[]): ReturnType<LoopDeps['streamText']> {
  return {
    stream: (async function* () {
      yield* parts;
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

/** Opens fine, then never emits anything — the observed failure. */
function stallingStream(): ReturnType<LoopDeps['streamText']> {
  return {
    stream: (async function* () {
      await new Promise(() => {});
      yield { type: 'text-delta', text: 'unreachable' };
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Silent for `gapMs`, one reasoning delta, silent again, then the answer. */
function thinkingStream(gapMs: number): ReturnType<LoopDeps['streamText']> {
  return {
    stream: (async function* () {
      await sleep(gapMs);
      yield { type: 'reasoning-delta', text: 'denke nach' };
      await sleep(gapMs);
      yield { type: 'text-delta', text: 'SPAETE_ANTWORT' };
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

/** Routes by model tag: gather always completes, synth/fallback per the map. */
function depsFor(byModel: Record<string, () => ReturnType<LoopDeps['streamText']>>): {
  deps: LoopDeps;
  seen: string[];
} {
  const seen: string[] = [];
  const deps: LoopDeps = {
    streamText: ((o: { model: { id: string } }) => {
      seen.push(o.model.id);
      const make = byModel[o.model.id];
      return make ? make() : streamOf([]);
    }) as unknown as LoopDeps['streamText'],
    generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
  };
  return { deps, seen };
}

function params(over: Partial<LoopEngineParams>): LoopEngineParams {
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
    abortSignal: new AbortController().signal,
    forceFinish: () => false,
    onText: vi.fn(),
    onReasoning: vi.fn(),
    ...over,
  };
}

describe('synth stall guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('falls back to the sibling lane when the synth goes silent', async () => {
    const { deps, seen } = depsFor({
      synth: stallingStream,
      fallback: () => streamOf([{ type: 'text-delta', text: 'ANTWORT_VON_FALLBACK' }]),
    });
    const onText = vi.fn();
    const onSynthFallback = vi.fn();

    const running = runAgenticLoop(
      params({ synthFallbackModel: fallbackModel, onText, onSynthFallback }),
      deps
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await running;

    expect(out.text).toBe('ANTWORT_VON_FALLBACK');
    expect(onSynthFallback).toHaveBeenCalledOnce();
    expect(seen).toEqual(['planner', 'synth', 'fallback']);
  });

  it('emits nothing from the stalled pass — the user sees one clean answer', async () => {
    const { deps } = depsFor({
      synth: stallingStream,
      fallback: () => streamOf([{ type: 'text-delta', text: 'SAUBER' }]),
    });
    const onText = vi.fn();

    const running = runAgenticLoop(params({ synthFallbackModel: fallbackModel, onText }), deps);
    await vi.advanceTimersByTimeAsync(20_000);
    await running;

    expect(onText.mock.calls.flat().join('')).toBe('SAUBER');
  });

  it('surfaces a typed stall when no sibling is configured', async () => {
    const { deps } = depsFor({ synth: stallingStream });

    const running = runAgenticLoop(params({}), deps).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const err = await running;

    expect(isSynthStall(err)).toBe(true);
    // Named TimeoutError so the caller's abort branch shows its friendly text.
    expect((err as Error).name).toBe('TimeoutError');
  });

  it('does NOT trip on a thinking model — reasoning counts as liveness', async () => {
    // 15s silent, reasoning, 15s silent, answer: 30s total, never 20s idle.
    const { deps, seen } = depsFor({ synth: () => thinkingStream(15_000) });
    const onReasoning = vi.fn();

    const running = runAgenticLoop(
      params({ synthFallbackModel: fallbackModel, onReasoning }),
      deps
    );
    await vi.advanceTimersByTimeAsync(31_000);
    const out = await running;

    expect(out.text).toBe('SPAETE_ANTWORT');
    expect(onReasoning).toHaveBeenCalledWith('denke nach');
    expect(seen).not.toContain('fallback');
  });

  it('announces the synth phase so the caller can show progress in the silence', async () => {
    const { deps } = depsFor({ synth: () => streamOf([{ type: 'text-delta', text: 'OK' }]) });
    const onSynthStart = vi.fn();

    await runAgenticLoop(params({ onSynthStart }), deps);

    expect(onSynthStart).toHaveBeenCalledOnce();
  });
});
