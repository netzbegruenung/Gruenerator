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
});

/**
 * Der Planer schweigt — und der Zug soll das ÜBERLEBEN und es MELDEN.
 *
 * Am 28.08.2026 nahm die Planer-Lane (GreenPT) die Anfrage an und schickte
 * nichts: 45 s Leerlauf in einem Zug von 47,9 s, danach eine korrekte Antwort
 * aus den mitgeführten Quellen. Das Degradieren funktionierte also; was fehlte,
 * war das Gedächtnis. Ohne Vermerk blieb dieselbe Lane erste Wahl, und der
 * nächste Zug hätte die Frist erneut abgesessen.
 */
describe('gather stall — degradieren UND vermerken', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Der Planer stellt sich tot, der Synth antwortet normal. */
  const stalledPlanner = (): { deps: LoopDeps; seen: string[] } =>
    depsFor({
      planner: stallingStream,
      synth: () => streamOf([{ type: 'text-delta', text: 'ANTWORT_AUS_QUELLEN' }]),
    });

  it('meldet die Werkzeugphase EINMAL, damit der Aufrufer die Lane vermerken kann', async () => {
    const { deps } = stalledPlanner();
    const onToolPhaseStall = vi.fn();

    const running = runAgenticLoop(params({ onToolPhaseStall }), deps);
    await vi.advanceTimersByTimeAsync(60_000);
    await running;

    expect(onToolPhaseStall).toHaveBeenCalledOnce();
  });

  it('antwortet trotzdem — der Stillstand kostet den Zug nicht', async () => {
    const { deps } = stalledPlanner();

    const running = runAgenticLoop(params({ onToolPhaseStall: vi.fn() }), deps);
    await vi.advanceTimersByTimeAsync(60_000);
    const out = await running;

    expect(out.text).toBe('ANTWORT_AUS_QUELLEN');
  });

  it('meldet NICHT, wenn der Planer normal liefert', async () => {
    const { deps } = depsFor({
      planner: () => streamOf([{ type: 'text-delta', text: 'ich suche' }]),
      synth: () => streamOf([{ type: 'text-delta', text: 'ANTWORT' }]),
    });
    const onToolPhaseStall = vi.fn();

    await runAgenticLoop(params({ onToolPhaseStall }), deps);

    expect(onToolPhaseStall).not.toHaveBeenCalled();
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

  const unified = (over: Partial<LoopEngineParams> = {}): LoopEngineParams =>
    params({ mode: 'unified', ...over });

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

  it('meldet NICHT an das Gesundheitsregister — das ist die Nutzer-Lane', async () => {
    // Absicht, keine Lücke: der unified-Stream fährt das GEWÄHLTE Modell, dessen
    // Gesundheit `responseStreamingService` bereits bucht. Und ein Stillstand
    // hier kann einer vollständigen Antwort folgen (Test oben) — ein Zäh-Vermerk
    // gegen eine Lane, die gerade sauber geantwortet hat, wäre schlicht falsch.
    // Der Vermerk gilt nur der festen Planer-Lane des Split.
    const { deps } = depsFor({
      synth: () =>
        ({
          stream: (async function* () {
            yield { type: 'text-delta', text: 'Halber Satz' };
            await new Promise(() => {});
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
    });
    const onToolPhaseStall = vi.fn();

    const running = runAgenticLoop(unified({ onToolPhaseStall }), deps).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CEILING_MS + 1_000);
    await running;

    expect(onToolPhaseStall).not.toHaveBeenCalled();
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
