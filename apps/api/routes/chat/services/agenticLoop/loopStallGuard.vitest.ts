import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runAgenticLoop, type LoopDeps, type LoopEngineParams } from './loopEngine.js';

/**
 * The silent-stall class. A lane accepts the request, returns a stream, and then
 * emits nothing. Before this guard the agentic loop had no first-token deadline
 * at all — the turn sat there for the full 120s wall clock with no text, no
 * error and no heartbeat, which users reported as "it just aborts". The
 * single-pass path had had this protection for a while; the loop, which the
 * tier-3.5 demotion routes most turns through, had none.
 */

const repairModel = { id: 'repair' } as unknown as LoopEngineParams['synthModel'];
const synthModel = { id: 'synth' } as unknown as LoopEngineParams['synthModel'];
const fallbackModel = { id: 'fallback' } as unknown as LoopEngineParams['synthModel'];
const repairTools = { web_search: {} } as unknown as LoopEngineParams['tools'];

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

/** Routes by model tag: the unified pass (`synth`) ends empty unless mapped, so the
 *  repair writer (`repair`) and its sibling (`fallback`) take over per the map. */
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
    synthModel,
    repairModel,
    tools: repairTools,
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

/** The writer's sibling fallback, reached through the unified-repair path. */
describe('synth stall guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('falls back to the sibling lane when the synth goes silent', async () => {
    const { deps, seen } = depsFor({
      repair: stallingStream,
      fallback: () => streamOf([{ type: 'text-delta', text: 'ANTWORT_VON_FALLBACK' }]),
    });
    const onText = vi.fn();
    const onSynthFallback = vi.fn();

    const running = runAgenticLoop(
      params({ repairFallback: fallbackModel, onText, onSynthFallback }),
      deps
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await running;

    expect(out.text).toBe('ANTWORT_VON_FALLBACK');
    expect(onSynthFallback).toHaveBeenCalledExactlyOnceWith('first_token_timeout');
    expect(seen).toEqual(['synth', 'repair', 'fallback']);
  });

  it('hands the fallback its own history, built only when it fires (#4201)', async () => {
    const full = [{ role: 'user' as const, content: 'langer Verlauf' }];
    const pruned = [{ role: 'user' as const, content: 'gekürzt' }];
    const sent: Record<string, unknown> = {};
    const deps: LoopDeps = {
      streamText: ((o: { model: { id: string }; messages: unknown }) => {
        sent[o.model.id] = o.messages;
        if (o.model.id === 'repair') return stallingStream();
        if (o.model.id === 'synth') return streamOf([]);
        return streamOf([{ type: 'text-delta', text: 'OK' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    const synthFallbackMessages = vi.fn((_system: string) => pruned);

    const running = runAgenticLoop(
      params({ synthMessages: full, repairFallback: fallbackModel, synthFallbackMessages }),
      deps
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await running;

    expect(sent.repair).toBe(full);
    expect(sent.fallback).toBe(pruned);
    expect(synthFallbackMessages).toHaveBeenCalledExactlyOnceWith('SYNTHSYS::[1] Quelle — Inhalt');
  });

  it('emits nothing from the stalled pass — the user sees one clean answer', async () => {
    const { deps } = depsFor({
      repair: stallingStream,
      fallback: () => streamOf([{ type: 'text-delta', text: 'SAUBER' }]),
    });
    const onText = vi.fn();

    const running = runAgenticLoop(params({ repairFallback: fallbackModel, onText }), deps);
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await running;

    expect(out.text).toBe('SAUBER');
    expect(onText).not.toHaveBeenCalled();
  });

  it('keeps the original answer when the writer stalls and no sibling is configured', async () => {
    const { deps, seen } = depsFor({ repair: stallingStream });

    const running = runAgenticLoop(params({}), deps);
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await running;

    // The repair swallows the stall and keeps the (empty) original for the caller.
    expect(out.text).toBe('');
    expect(out.replacedStreamed).toBeUndefined();
    expect(seen).toEqual(['synth', 'repair']);
  });

  it('does NOT trip on a thinking model — reasoning counts as liveness', async () => {
    // 15s silent, reasoning, 15s silent, answer: 30s total, never 20s idle.
    const { deps, seen } = depsFor({ repair: () => thinkingStream(15_000) });
    const onReasoning = vi.fn();

    const running = runAgenticLoop(params({ repairFallback: fallbackModel, onReasoning }), deps);
    await vi.advanceTimersByTimeAsync(31_000);
    const out = await running;

    expect(out.text).toBe('SPAETE_ANTWORT');
    expect(onReasoning).toHaveBeenCalledWith('denke nach');
    expect(seen).not.toContain('fallback');
  });
});

/**
 * Der UNIFIED-Pfad hatte die Uhr nie bekommen. Der gather-Stream ist seit dem
 * 20.08.2026 bewacht, der synth seit Längerem — der eine Stream, der Werkzeuge
 * hält UND die Antwort schreibt, lief weiter nur gegen die absolute Decke
 * (`hardCapMs`, 300 s).
 *
 * Gemessen in #2948: je drei von vierzehn trivialen Zügen endeten auf
 * 300.0–300.5 s, jedes Mal bei anderen Items, zwei ohne einen einzigen
 * Werkzeugaufruf — und alle mit inhaltlich richtiger Antwort, weil der Text im
 * unified-Modus längst auf der Leitung war, bevor der Stream hängen blieb.
 */
describe('tool phase stall guard (unified)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const unified = (over: Partial<LoopEngineParams> = {}): LoopEngineParams => {
    const { repairModel: _repair, ...rest } = params(over);
    return rest;
  };

  /** Ohne `toolActivity` gilt der Deckel aus den gemounteten Werkzeugen: ohne
   *  Werkzeuge sind das 20 s Aufruf-Timeout + 15 s Vorlauf = 35 s. */
  const CEILING_MS = 35_000;

  it('gibt eine FERTIGE Antwort zurück, wenn nur der Stream nicht zugeht', async () => {
    const { deps } = depsFor({
      synth: () =>
        ({
          stream: (async function* () {
            yield { type: 'text-delta', text: 'Paragraf 263 StGB' };
            yield { type: 'finish', finishReason: 'stop' };
            await new Promise(() => {});
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
    });
    const onText = vi.fn();

    const running = runAgenticLoop(unified({ onText }), deps);
    await vi.advanceTimersByTimeAsync(CEILING_MS + 1_000);
    const out = await running;

    // Kein Wurf: `finish` sagt, die Generierung war fertig. Sonst hängt der
    // Aufrufer die Abbruch-Fussnote an eine vollständige Antwort.
    expect(out.text).toBe('Paragraf 263 StGB');
    expect(onText.mock.calls.flat().join('')).toBe('Paragraf 263 StGB');
  });

  it('meldet einen Abbruch, wenn die Stille MITTEN in der Antwort steht', async () => {
    const { deps } = depsFor({
      synth: () =>
        ({
          stream: (async function* () {
            yield { type: 'text-delta', text: 'Halber Satz' };
            await new Promise(() => {});
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
    });

    const running = runAgenticLoop(unified({}), deps).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CEILING_MS + 1_000);
    const err = await running;

    // Ohne `finish` ist der Text ein Stumpf — als TimeoutError melden, damit
    // die Abbruch-Fussnote des Aufrufers greift.
    expect((err as Error).name).toBe('TimeoutError');
  });

  it('meldet NICHT an das Gesundheitsregister, wenn schon Text kam', async () => {
    // Ein Stillstand NACH sichtbarer Ausgabe kann einer vollständigen Antwort
    // folgen (Test oben) — ein Zäh-Vermerk gegen eine Lane, die gerade sauber
    // geantwortet hat, wäre schlicht falsch. Gemeldet wird unified nur eine
    // Lane, die keine Spur hinterliess.
    const { deps } = depsFor({
      synth: () =>
        ({
          stream: (async function* () {
            yield { type: 'text-delta', text: 'Halber Satz' };
            await new Promise(() => {});
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
    });
    const onLaneUnhealthy = vi.fn();

    const running = runAgenticLoop(unified({ onLaneUnhealthy }), deps).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CEILING_MS + 1_000);
    await running;

    expect(onLaneUnhealthy).not.toHaveBeenCalled();
  });

  it('wertet einen LAUFENDEN Werkzeugaufruf als Lebenszeichen', async () => {
    // Ein Erzeugungswerkzeug darf 90 s blockieren (TOOL_TIMEOUT_OVERRIDES_MS) —
    // weit über dem engen Fenster, das der Zähler erlaubt.
    let inFlight = 0;
    const { deps } = depsFor({
      synth: () =>
        ({
          stream: (async function* () {
            yield { type: 'text-delta', text: 'Ich erstelle das PDF. ' };
            inFlight += 1;
            await sleep(90_000);
            inFlight -= 1;
            yield { type: 'text-delta', text: 'Fertig.' };
            yield { type: 'finish', finishReason: 'stop' };
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
    });

    const running = runAgenticLoop(unified({ toolActivity: { inFlight: () => inFlight } }), deps);
    await vi.advanceTimersByTimeAsync(91_000);
    const out = await running;

    expect(out.text).toBe('Ich erstelle das PDF. Fertig.');
  });
});

/**
 * The empty class. Live 03.11.2026 Mistral Large 4 closed a thinking stream
 * with no text and no finish reason (reproduced against the API: 1 of 13
 * calls, `finish_reason` null after 64 s and 1.246 chars of thinking). The
 * loop shipped „keine passende Antwort" without a log line — three times in
 * one thread — while the single-pass path hands the same case to the sibling.
 */
describe('synth empty guard', () => {
  /** Thinks, then closes without a word and without a finish part. */
  const emptyStream = () => streamOf([{ type: 'reasoning-delta', text: 'denke nach' }]);

  it('hands an empty pass to the sibling lane once', async () => {
    const { deps, seen } = depsFor({
      repair: emptyStream,
      fallback: () => streamOf([{ type: 'text-delta', text: 'ANTWORT_VON_FALLBACK' }]),
    });
    const onText = vi.fn();
    const onSynthFallback = vi.fn();

    const out = await runAgenticLoop(
      params({ repairFallback: fallbackModel, onText, onSynthFallback }),
      deps
    );

    expect(out.text).toBe('ANTWORT_VON_FALLBACK');
    // The repair is silent — the caller's completion replace carries the text.
    expect(onText).not.toHaveBeenCalled();
    expect(onSynthFallback).toHaveBeenCalledExactlyOnceWith('empty_completion');
    expect(seen).toEqual(['synth', 'repair', 'fallback']);
  });

  it('leaves an empty pass to the caller when no sibling is configured', async () => {
    const { deps, seen } = depsFor({ repair: emptyStream });

    const out = await runAgenticLoop(params({}), deps);

    expect(out.text).toBe('');
    expect(seen).toEqual(['synth', 'repair']);
  });

  it('does not touch a pass that wrote an answer', async () => {
    const { deps, seen } = depsFor({
      repair: () => streamOf([{ type: 'text-delta', text: 'ANTWORT' }]),
      fallback: () => streamOf([{ type: 'text-delta', text: 'NIE' }]),
    });
    const onSynthFallback = vi.fn();

    const out = await runAgenticLoop(
      params({ repairFallback: fallbackModel, onSynthFallback }),
      deps
    );

    expect(out.text).toBe('ANTWORT');
    expect(onSynthFallback).not.toHaveBeenCalled();
    expect(seen).toEqual(['synth', 'repair']);
  });
});
