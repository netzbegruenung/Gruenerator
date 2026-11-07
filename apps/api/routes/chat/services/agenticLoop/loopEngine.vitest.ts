import { describe, it, expect, vi } from 'vitest';

import {
  runAgenticLoop,
  buildPrepareStep,
  looksLikeToolPlanLeak,
  looksLikeSynthRefusal,
  FORCE_FINISH_SYSTEM_SUFFIX,
  TOOL_USE_RULES,
  LOOP_SUFFIX,
  SYNTH_RETRY_SYSTEM_SUFFIX,
  SYNTH_REFUSAL_TEXT,
  SYNTH_CUTOFF_RETRY_SUFFIX,
  SYNTH_INVALID_JSON_RETRY_SUFFIX,
  SYNTH_DEGENERATE_RETRY_SUFFIX,
  TurnSuspendedError,
  type LoopDeps,
  type LoopEngineParams,
} from './loopEngine.js';
import { DEGENERATION_NOTICE } from './degeneration.js';
import { createAnswerValidator } from './synthVerdicts.js';
import { NO_CAPABILITY_DENIAL_RULE } from '../../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';

import { APICallError, type ModelMessage } from 'ai';

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

  // Eine @-Erwähnung hat ein Werkzeug benannt. `required` würde nur IRGENDEINEN
  // Aufruf garantieren — und der Erwähnungstext ist zu diesem Zeitpunkt aus der
  // Nachricht entfernt, das Modell sieht die Wahl also nicht mehr.
  it('nennt das erwähnte Werkzeug auf Schritt 0 statt nur "required"', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      'bundestag'
    );
    expect(prep({ stepNumber: 0 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'bundestag' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['bundestag'],
    });
    // Danach entscheidet wieder der Planer.
    expect(prep({ stepNumber: 1 })).toEqual({});
  });

  // Stillstand vom 28.10.2026: der Prompt sagt „Fragen nach Reden gehen immer an
  // `bundestag_reden`, nicht an `bundestag`", der Schritt erzwingt `bundestag` —
  // Cortecs/Melious schwiegen 15 s. Der Hinweis steht NACH dem Prompt.
  it('hängt an einen benannten Schritt den Hinweis, dass nur dieses Werkzeug zur Wahl steht', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      () => 'web_search',
      undefined,
      'bundestag'
    );
    const first = prep({ stepNumber: 0 }).system ?? '';
    expect(first.startsWith('sys')).toBe(true);
    expect(first).toContain('Aufruf in diesem Schritt ist `bundestag`');
    expect(first).toContain('stehen diesem Schritt nicht zur Wahl');
    expect(prep({ stepNumber: 1 }).system).toContain('Aufruf in diesem Schritt ist `web_search`');
  });

  it('ohne Namen (required) bleibt der Systemprompt unberührt', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, true);
    expect(prep({ stepNumber: 0 }).system).toBeUndefined();
  });

  it('ohne den Zwang wirkt der Name gar nicht — der Bann vetot zuerst', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      false,
      undefined,
      undefined,
      'bundestag'
    );
    expect(prep({ stepNumber: 0 })).toEqual({});
  });

  it('gibt dem erzwungenen Schritt 0 die eigene Werkzeugmenge, Schritt 1 behält den Umfang', () => {
    const first = ['web_search', 'gruenerator_search'];
    const noScope = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      null,
      undefined,
      first
    );
    expect(noScope({ stepNumber: 0 })).toEqual({ toolChoice: 'required', activeTools: first });
    expect(noScope({ stepNumber: 1 })).toEqual({});

    const withScope = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      null,
      () => ['a', 'b', 'meine_inhalte_laden'],
      first
    );
    expect(withScope({ stepNumber: 0 })).toEqual({ toolChoice: 'required', activeTools: first });
    expect(withScope({ stepNumber: 1 })).toEqual({
      activeTools: ['a', 'b', 'meine_inhalte_laden'],
    });
  });

  it('ein benanntes Werkzeug schlägt die Menge des ersten Schritts', () => {
    const named = {
      toolChoice: { type: 'tool', toolName: 'bundestag' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['bundestag'],
    };
    const bare = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      'bundestag',
      undefined,
      ['web_search']
    );
    expect(bare({ stepNumber: 0 })).toEqual(named);
    const scoped = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      'bundestag',
      () => ['a'],
      ['web_search']
    );
    expect(scoped({ stepNumber: 0 })).toEqual(named);
  });

  it('die Menge des ersten Schritts wird ohne Zwang nie gelesen', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      false,
      undefined,
      undefined,
      null,
      undefined,
      ['web_search']
    );
    expect(prep({ stepNumber: 0 })).toEqual({});
  });
});

describe('buildPrepareStep — welche Werkzeuge mitgehen', () => {
  const never = () => false;
  const scope = () => ['gruenerator_search', 'meine_inhalte_laden'];

  it('lässt den Aufruf unverändert, solange nichts zurückgestellt ist', () => {
    // `undefined` ist das Verhalten vor toolScope.ts — kein `activeTools`-Feld,
    // also schickt das SDK den ganzen montierten Katalog.
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, undefined, undefined, null);
    expect(prep({ stepNumber: 0 })).toEqual({});
  });

  it('schneidet auf JEDEM Zweig, auch auf dem Schlussschritt', () => {
    // `toolChoice: 'none'` unterdrückt den AUFRUF, nicht die Definitionen: ohne
    // das Feld hier zahlt der Schlussschritt den vollen Katalog noch einmal.
    const prep = buildPrepareStep(
      'sys',
      'SUFF',
      1,
      never,
      false,
      undefined,
      undefined,
      null,
      scope
    );
    expect(prep({ stepNumber: 0 })).toEqual({
      toolChoice: 'none',
      system: 'sysSUFF',
      activeTools: ['gruenerator_search', 'meine_inhalte_laden'],
    });
  });

  it('schneidet auch, wenn ein Werkzeug erzwungen wird', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      () => 'web_search',
      undefined,
      'bundestag',
      scope
    );
    // Ein benannter Schritt schickt nur sein Werkzeug — siehe
    // "ein benanntes Werkzeug geht allein".
    expect(prep({ stepNumber: 0 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'bundestag' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['bundestag'],
    });
    expect(prep({ stepNumber: 1 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'web_search' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['web_search'],
    });
  });

  it('liest den Umfang bei JEDEM Schritt neu — ein Lader wirkt sofort', () => {
    // Der Getter ist der Punkt: ruft das Modell in Schritt 0 den Lader, muss
    // Schritt 1 die geöffnete Gruppe sehen. Ein eingefangenes Array wäre blind.
    let offen = false;
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      false,
      undefined,
      undefined,
      null,
      () => (offen ? undefined : ['gruenerator_search', 'meine_inhalte_laden'])
    );
    expect(prep({ stepNumber: 0 })).toEqual({
      activeTools: ['gruenerator_search', 'meine_inhalte_laden'],
    });
    offen = true;
    expect(prep({ stepNumber: 1 })).toEqual({});
  });
});

describe('buildPrepareStep — ein benanntes Werkzeug geht allein', () => {
  const never = () => false;
  // Der Umfang zeigt `documents` nicht. Wird es trotzdem benannt, muss die
  // Definition mit — sonst verlangt derselbe Schritt einen Aufruf und liefert
  // das Werkzeug nicht mit. Und NUR sie: ein Name über dem vollen Katalog liess
  // Gemma 4 bei Cortecs und Melious bis zum Abbruch stumm generieren (28.10.2026).
  const eng = () => ['gruenerator_search', 'meine_inhalte_laden'];

  it('schickt nur das erwähnte Werkzeug, auch wenn der Umfang es zurückstellt', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      true,
      undefined,
      undefined,
      'documents',
      eng
    );
    expect(prep({ stepNumber: 0 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'documents' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['documents'],
    });
  });

  it('schickt nur das erzwungene Ausweich-Werkzeug', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      false,
      () => 'documents',
      undefined,
      null,
      eng
    );
    expect(prep({ stepNumber: 1 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'documents' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['documents'],
    });
  });

  it('schneidet den Umfang weg, auch wenn das Werkzeug ohnehin mitgeht', () => {
    const prep = buildPrepareStep(
      'sys',
      'suffix',
      5,
      never,
      false,
      () => 'gruenerator_search',
      undefined,
      null,
      eng
    );
    expect(prep({ stepNumber: 1 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'gruenerator_search' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['gruenerator_search'],
    });
  });
});

describe('buildPrepareStep — forced fallback tool', () => {
  const never = () => false;

  it('names the tool instead of merely requiring one', () => {
    // `required` would let the planner re-run the internal search that just
    // came back empty — which is exactly the loop the fallback has to break.
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => 'web_search');
    expect(prep({ stepNumber: 1 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'web_search' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['web_search'],
    });
  });

  it('never forces on step 0 — there is no tool result to react to yet', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => 'web_search');
    expect(prep({ stepNumber: 0 })).toEqual({});
  });

  it('leaves the choice to the model when the guard returns null', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => null);
    expect(prep({ stepNumber: 1 })).toEqual({});
  });

  it('is re-evaluated per step, not captured once', () => {
    let forced: string | null = null;
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => forced);
    expect(prep({ stepNumber: 1 })).toEqual({});
    forced = 'web_search';
    expect(prep({ stepNumber: 2 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'web_search' },
      system: expect.stringContaining('DIESER SCHRITT'),
      activeTools: ['web_search'],
    });
  });

  it('force-finish beats the fallback on the last step', () => {
    // Otherwise the turn would end on a tool call with no answer written.
    const prep = buildPrepareStep('sys', 'SUFF', 2, never, false, () => 'web_search');
    expect(prep({ stepNumber: 1 })).toEqual({ toolChoice: 'none', system: 'sysSUFF' });
  });

  it('stays inert when no fallback is wired (default arg)', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    expect(prep({ stepNumber: 1 })).toEqual({});
  });
});

// Live 23.09.2026: der einzige Aufruf (`notebook_quellen`) scheiterte mit
// einer Meldung, die sagte, wie es geht — der Planer hörte nach einem Schritt
// auf, und die Antwort behauptete, die Funktion gebe es nicht.
describe('buildPrepareStep — one retry after a step whose calls all failed', () => {
  const never = () => false;
  const NO_NB = 'Kein Notebook ausgewählt — gib notebookId an.';
  const failedStep = {
    content: [
      { type: 'tool-call', toolName: 'notebook_quellen' },
      { type: 'tool-result', toolName: 'notebook_quellen', output: { error: NO_NB } },
    ],
  };
  const okStep = {
    content: [
      { type: 'tool-result', toolName: 'notebook_quellen', output: { error: NO_NB } },
      { type: 'tool-result', toolName: 'web_search', output: { results: [] } },
    ],
  };

  it('nudges the next step with the tool name and its error', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    const out = prep({ stepNumber: 1, steps: [failedStep] });
    expect(out.toolChoice).toBeUndefined();
    expect(out.system).toContain('sys');
    expect(out.system).toContain('notebook_quellen');
    expect(out.system).toContain(NO_NB);
    expect(out.system).toMatch(/erneut/);
    expect(out.system).toMatch(/Behaupte NIE/);
  });

  it('counts a thrown tool (tool-error part) as failed too', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    const out = prep({
      stepNumber: 1,
      steps: [
        { content: [{ type: 'tool-error', toolName: 'documents', error: new Error('boom') }] },
      ],
    });
    expect(out.system).toContain('documents');
    expect(out.system).toContain('boom');
  });

  it('only once per turn', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    expect(prep({ stepNumber: 1, steps: [failedStep] }).system).toContain('notebook_quellen');
    expect(prep({ stepNumber: 2, steps: [failedStep, failedStep] })).toEqual({});
  });

  // Review PR #3568: eine Wächter-Absage („Zu viele Fehlversuche … erkläre,
  // was nicht geklappt hat") ist eine Weisung, kein behebbarer Fehler.
  it('not after a guard refusal', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    const guarded = {
      content: [
        {
          type: 'tool-result',
          toolName: 'notebook_quellen',
          output: { error: 'Zu viele Fehlversuche mit diesem Tool', guard: 'failure_cap' },
        },
      ],
    };
    expect(prep({ stepNumber: 1, steps: [guarded] })).toEqual({});
  });

  it('not when one call of the step succeeded', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    expect(prep({ stepNumber: 1, steps: [okStep] })).toEqual({});
  });

  it('not after a step without tool calls', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false);
    expect(prep({ stepNumber: 1, steps: [{ content: [{ type: 'text' }] }] })).toEqual({});
  });

  it('force-finish still wins on the last step', () => {
    const prep = buildPrepareStep('sys', 'SUFF', 2, never, false);
    expect(prep({ stepNumber: 1, steps: [failedStep] })).toEqual({
      toolChoice: 'none',
      system: 'sysSUFF',
    });
  });

  it('keeps a forced fallback tool and adds the nudge to its system', () => {
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => 'web_search');
    const out = prep({ stepNumber: 1, steps: [failedStep] });
    expect(out.toolChoice).toEqual({ type: 'tool', toolName: 'web_search' });
    expect(out.system).toContain('notebook_quellen');
  });
});

// Fake models are opaque tags — the engine only forwards them to
// streamText/generateText, and the injected fakes read `.id` to assert which
// model drove which phase.
const model = { id: 'synth' } as unknown as LoopEngineParams['model'];

type Part = { type: string; text?: string; error?: unknown; finishReason?: string };
type StreamOpts = {
  model: { id: string };
  tools?: Record<string, { execute?: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }>;
  system?: string;
};
// `before` simulates the real SDK's tool loop: the tool call happens WHILE the
// stream is being drained, not before.
function streamOf(parts: Part[], before?: () => Promise<void>): ReturnType<LoopDeps['streamText']> {
  return {
    stream: (async function* () {
      if (before) await before();
      yield* parts;
    })(),
  } as unknown as ReturnType<LoopDeps['streamText']>;
}

function baseParams(over: Partial<LoopEngineParams>): LoopEngineParams {
  return {
    model,
    tools: {},
    toolSystem: 'TOOLSYS',
    buildRepairSystem: (s) => `SYNTHSYS::${s}`,
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

type WriterPass = Part[] | (() => ReturnType<LoopDeps['streamText']>);

/**
 * Drives the repair path: `unified` answers the tool pass (model `synth`, with
 * tools), the model `repair` is the tool-less writer whose passes are scripted
 * in order (the last one repeats). Records the writer's system prompts and the
 * messages it saw.
 */
function repairDeps(unified: Part[], passes: WriterPass[]) {
  const calls: string[] = [];
  const writerSystems: string[] = [];
  const writerMessages: ModelMessage[][] = [];
  const writerOpts: StreamOpts[] = [];
  let writerCall = 0;
  const deps: LoopDeps = {
    generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    streamText: ((o: StreamOpts & { messages: ModelMessage[] }) => {
      calls.push(o.model.id);
      if (o.model.id !== 'repair') return streamOf(unified);
      writerSystems.push(o.system ?? '');
      writerMessages.push(o.messages);
      writerOpts.push(o);
      const pass = passes[Math.min(writerCall++, passes.length - 1)] ?? [];
      return typeof pass === 'function' ? pass() : streamOf(pass);
    }) as unknown as LoopDeps['streamText'],
  };
  return { deps, calls, writerSystems, writerMessages, writerOpts, writerCalls: () => writerCall };
}
const repairLane = { id: 'repair' } as unknown as LoopEngineParams['model'];
const repairTools = { web_search: {} } as unknown as LoopEngineParams['tools'];
const repairParams = (over: Partial<LoopEngineParams> = {}) =>
  baseParams({ repairModel: repairLane, tools: repairTools, ...over });
const text = (t: string): Part[] => (t.length > 0 ? [{ type: 'text-delta', text: t }] : []);

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

    const out = await runAgenticLoop(baseParams({ onText }), deps);

    expect(out.text).toBe('UNIFIED_ANSWER');
    expect(onText).toHaveBeenCalledWith('UNIFIED_ANSWER');
    // One streamText on the selected model WITH tools.
    expect(calls).toEqual(['streamText:synth:tools=true']);
  });

  it('runs the ensureOwedTools guarantee AFTER the stream (compound artifact net)', async () => {
    const ensureOwedTools = vi.fn(async () => {});
    const deps: LoopDeps = {
      streamText: (() =>
        streamOf([{ type: 'text-delta', text: 'A' }])) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    await runAgenticLoop(baseParams({ ensureOwedTools }), deps);
    // Regression: ensureOwedTools never fired in unified mode, so a compound sharepic
    // turn that only searched left the artifact uncreated.
    expect(ensureOwedTools).toHaveBeenCalledTimes(1);
  });
});

describe('runAgenticLoop — unified lane chain', () => {
  const lane = (id: string) => ({ id }) as unknown as LoopEngineParams['model'];
  const fallback = lane('fallback');
  const rejected = () =>
    new APICallError({
      message: 'The request was rejected as malformed.',
      url: 'https://melious.example/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 400,
    });
  const hang = () =>
    ({
      stream: (async function* () {
        await new Promise(() => {});
      })(),
    }) as unknown as ReturnType<LoopDeps['streamText']>;

  function chainDeps(first: () => ReturnType<LoopDeps['streamText']>) {
    const calls: string[] = [];
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        calls.push(o.model.id);
        if (o.model.id === 'fallback') {
          return streamOf([{ type: 'text-delta', text: 'FALLBACK_ANSWER' }]);
        }
        return first();
      }) as unknown as LoopDeps['streamText'],
    };
    return { deps, calls };
  }
  const params = (over: Partial<LoopEngineParams> = {}) =>
    baseParams({ fallbackModels: [fallback], ...over });

  it('(a) moves to the next lane when the first rejects before any output', async () => {
    const { deps, calls } = chainDeps(() => streamOf([{ type: 'error', error: rejected() }]));
    const onLaneUnhealthy = vi.fn();
    const out = await runAgenticLoop(params({ onLaneUnhealthy }), deps);
    expect(calls).toEqual(['synth', 'fallback']);
    expect(out.text).toBe('FALLBACK_ANSWER');
    // Ein 400 ist unsere Anfrage, kein krankes Modell: kein Vermerk.
    expect(onLaneUnhealthy).not.toHaveBeenCalled();
  });

  it('reports a lane that stalled before any output, with its index', async () => {
    vi.useFakeTimers();
    try {
      const { deps, calls } = chainDeps(hang);
      const onLaneUnhealthy = vi.fn();
      const pending = runAgenticLoop(
        params({ onLaneUnhealthy, abortSignal: new AbortController().signal }),
        deps
      );
      await vi.advanceTimersByTimeAsync(9_000);
      expect(calls).toEqual(['synth', 'fallback']);
      expect((await pending).text).toBe('FALLBACK_ANSWER');
      expect(onLaneUnhealthy).toHaveBeenCalledExactlyOnceWith(0, 'stall');
    } finally {
      vi.useRealTimers();
    }
  });

  it('(b) does not switch once text has streamed — the error surfaces to the caller', async () => {
    const onText = vi.fn();
    const { deps, calls } = chainDeps(() =>
      streamOf([
        { type: 'text-delta', text: 'Halbe Antwort' },
        { type: 'error', error: rejected() },
      ])
    );
    await expect(runAgenticLoop(params({ onText }), deps)).rejects.toBeDefined();
    expect(calls).toEqual(['synth']);
    expect(onText).toHaveBeenCalledWith('Halbe Antwort');
  });

  it('(c) switches after the 15 s first-response window when the first lane is silent', async () => {
    vi.useFakeTimers();
    try {
      const { deps, calls } = chainDeps(hang);
      const pending = runAgenticLoop(params({ abortSignal: new AbortController().signal }), deps);
      await vi.advanceTimersByTimeAsync(16_000);
      expect(calls).toEqual(['synth', 'fallback']);
      expect((await pending).text).toBe('FALLBACK_ANSWER');
    } finally {
      vi.useRealTimers();
    }
  });

  it('(d) does not switch after a tool call, even if nothing else came out', async () => {
    const { deps, calls } = chainDeps(() =>
      streamOf([{ type: 'tool-call' }, { type: 'error', error: rejected() }])
    );
    await expect(runAgenticLoop(params(), deps)).rejects.toBeDefined();
    expect(calls).toEqual(['synth']);
  });

  it('the last lane gets no short first-response window and its error surfaces', async () => {
    const { deps, calls } = chainDeps(() => streamOf([{ type: 'error', error: rejected() }]));
    await expect(runAgenticLoop(params({ fallbackModels: [] }), deps)).rejects.toBeDefined();
    expect(calls).toEqual(['synth']);
  });
});

describe('unified suffix — tool and writer rules', () => {
  it('gives the unified stream the tool and writer rules', async () => {
    let seen:
      (StreamOpts & { prepareStep?: (a: { stepNumber: number }) => { system?: string } }) | null =
      null;
    const deps: LoopDeps = {
      streamText: ((o: typeof seen) => {
        seen = o;
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    await runAgenticLoop(baseParams({ maxSteps: 1 }), deps);
    expect(seen).not.toBeNull();
    const system = seen!.system ?? '';
    expect(system).toBe(`TOOLSYS${LOOP_SUFFIX}`);
    expect(system).toContain(TOOL_USE_RULES);
    expect(system).toContain(NO_CAPABILITY_DENIAL_RULE);
    expect(system).toContain('ANTWORTE KONKRET');
    // Hinweise der Werkzeuge binden die Antwort.
    expect(system).toContain('`fuerSchreiber`');
    expect(system).toContain('`antwortregel`');
    // The unified model writes the answer — no tool-phase-only ban may reach it.
    expect(system).not.toContain('Schreibe in dieser Phase KEINE finale Antwort');
    // maxSteps=1 makes step 0 the force-finish step, which overrides `system`.
    const override = seen!.prepareStep?.({ stepNumber: 0 }).system ?? '';
    expect(override).toContain(TOOL_USE_RULES);
    expect(override).toContain(NO_CAPABILITY_DENIAL_RULE);
    expect(override).toContain(FORCE_FINISH_SYSTEM_SUFFIX.trim().slice(0, 20));
  });

  it('keeps the AT country block in unified', async () => {
    let system = '';
    const deps: LoopDeps = {
      streamText: ((o: StreamOpts) => {
        system = o.system ?? '';
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    await runAgenticLoop(
      baseParams({ toolSystem: 'BASE\n\n## LÄNDERKONTEXT: ÖSTERREICH\nAT' }),
      deps
    );
    expect(system).toContain('## LÄNDERKONTEXT: ÖSTERREICH');
  });
});

describe('runAgenticLoop — unified repair', () => {
  const repairModel = { id: 'repair' } as unknown as LoopEngineParams['model'];
  const tools = { web_search: {} } as unknown as LoopEngineParams['tools'];
  const GOOD = 'Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].';

  /** `first` answers the unified pass (model `synth`), `repairText` the writer. */
  function setup(first: Part[] | (() => ReturnType<LoopDeps['streamText']>), repairText = GOOD) {
    const calls: string[] = [];
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        calls.push(o.model.id);
        if (o.model.id === 'repair') return streamOf([{ type: 'text-delta', text: repairText }]);
        return typeof first === 'function' ? first() : streamOf(first);
      }) as unknown as LoopDeps['streamText'],
    };
    return { deps, calls };
  }
  const params = (over: Partial<LoopEngineParams> = {}) =>
    baseParams({ repairModel, tools, ...over });

  it('re-writes an empty answer on the repair lane when no artifact was produced', async () => {
    const onText = vi.fn();
    const { deps, calls } = setup([]);
    const out = await runAgenticLoop(params({ onText }), deps);
    expect(calls).toEqual(['synth', 'repair']);
    expect(out.text).toBe(GOOD);
    expect(out.replacement).toBe('unified_repair');
    // The repair is silent — the completion replace carries it.
    expect(onText).not.toHaveBeenCalled();
  });

  it('does not repair an empty answer after an artifact (the caller confirms it)', async () => {
    const { deps, calls } = setup([]);
    const out = await runAgenticLoop(params({ producedArtifact: () => true }), deps);
    expect(calls).toEqual(['synth']);
    expect(out.text).toBe('');
    expect(out.replacement).toBeUndefined();
  });

  it('repairs an answer the validator rejects', async () => {
    const { deps, calls } = setup([{ type: 'text-delta', text: 'Ein abgebrochener Satz, der' }]);
    const out = await runAgenticLoop(
      params({ validateAnswer: (t) => (t === GOOD ? null : SYNTH_CUTOFF_RETRY_SUFFIX) }),
      deps
    );
    expect(calls).toEqual(['synth', 'repair']);
    expect(out.replacement).toBe('unified_repair');
  });

  it('repairs a degenerate stream instead of trimming it', async () => {
    const proseSentence = (i: number): string =>
      `Punkt ${i}: Die Grünen fordern eine Ausbildungsgarantie mit ${i * 3} Maßnahmen und einem BAföG-Plus von ${i * 11} Euro, damit junge Menschen im Wahlkreis ${i * 7} unabhängig vom Elternhaus lernen können. `;
    const spam = '--- Ende.** --- Fertig.** --- Danke! 😊 --- Abschluss.** --- FINAL --- ';
    const { deps, calls } = setup(
      () =>
        ({
          stream: (async function* () {
            for (let i = 0; i < 40; i++) yield { type: 'text-delta', text: proseSentence(i) };
            while (true) yield { type: 'text-delta', text: spam };
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>
    );
    const out = await runAgenticLoop(params(), deps);
    expect(calls).toEqual(['synth', 'repair']);
    expect(out.replacement).toBe('unified_repair');
    expect(out.text).toBe(GOOD);
  });

  it('repairs a unified answer that leaked its tool plan', async () => {
    const { deps, calls } = setup([{ type: 'text-delta', text: "Let's perform web_search." }]);
    const out = await runAgenticLoop(params(), deps);
    expect(calls).toEqual(['synth', 'repair']);
    expect(out.text).toBe(GOOD);
    expect(out.replacement).toBe('unified_repair');
  });

  it('repairs an answer that ended on finishReason length', async () => {
    const { deps, calls } = setup([
      { type: 'text-delta', text: 'Eine lange Antwort, die abgeschnitten wurde' },
      { type: 'finish', finishReason: 'length' },
    ]);
    const out = await runAgenticLoop(params(), deps);
    expect(calls).toEqual(['synth', 'repair']);
    expect(out.replacement).toBe('unified_repair');
  });

  it('swaps an English refusal for the German one without a repair pass', async () => {
    const { deps, calls } = setup([
      { type: 'text-delta', text: "I'm sorry, but I can't help with that." },
    ]);
    const out = await runAgenticLoop(params(), deps);
    expect(calls).toEqual(['synth']);
    expect(out.text).toBe(SYNTH_REFUSAL_TEXT);
    expect(out.replacement).toBe('refusal_swap');
  });

  it('calls streamText exactly once for a clean answer', async () => {
    const { deps, calls } = setup([
      { type: 'text-delta', text: GOOD },
      { type: 'finish', finishReason: 'stop' },
    ]);
    const out = await runAgenticLoop(params(), deps);
    expect(calls).toEqual(['synth']);
    expect(out.text).toBe(GOOD);
    expect(out.replacement).toBeUndefined();
  });

  it("keeps today's behaviour without a repair lane", async () => {
    const { deps, calls } = setup([]);
    const out = await runAgenticLoop(baseParams({ tools }), deps);
    expect(calls).toEqual(['synth']);
    expect(out.text).toBe('');
  });
});

describe('repair writer — repairMessages: the tool replay must not reach the tool-less writer', () => {
  const userMsg: ModelMessage = { role: 'user', content: 'recherchiere X' };
  const replayAssistant: ModelMessage = {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'web_search', input: {} }],
  };

  it('the tool pass gets the replay history, the writer gets the plain one', async () => {
    const seen: Record<string, ModelMessage[]> = {};
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts & { messages: ModelMessage[] }) => {
        seen[o.model.id] = o.messages;
        return streamOf(o.model.id === 'repair' ? text('Die Antwort steht hier.') : []);
      }) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(
      repairParams({ messages: [replayAssistant, userMsg], repairMessages: [userMsg] }),
      deps
    );

    expect(seen['synth']).toHaveLength(2);
    // Regression: with the replay in its context and no tools mounted, the writer
    // imitated the tool-call pattern ("Let's perform web_search.") instead of answering.
    expect(seen['repair']).toEqual([userMsg]);
  });

  it('falls back to `messages` when repairMessages is omitted', async () => {
    const { deps, writerMessages } = repairDeps([], [text('Die Antwort steht hier.')]);

    await runAgenticLoop(repairParams({ messages: [userMsg] }), deps);

    expect(writerMessages).toEqual([[userMsg]]);
  });
});

describe('looksLikeToolPlanLeak', () => {
  it('flags the observed live failure (short, English, names a mounted tool)', () => {
    expect(looksLikeToolPlanLeak("Let's perform web_search.", ['web_search'])).toBe(true);
  });

  it('flags an announced action even without a tool name', () => {
    expect(looksLikeToolPlanLeak('I will search for that now.', [])).toBe(true);
  });

  // The two answers this guard destroyed live on 02.08.2026 — both correct, both
  // in the format the message prescribed, both replaced with "Ich konnte dazu
  // leider keine passende Antwort finden". They are short, English-free and
  // carry no German function word, which is exactly what the deleted rule
  // punished.
  it('keeps a short answer whose format the user prescribed', () => {
    expect(
      looksLikeToolPlanLeak('ALT=45000 €; NEU=49500 €; DIFFERENZ=4500 €', ['web_search'])
    ).toBe(false);
    expect(
      looksLikeToolPlanLeak('ZUSTAND=ORIGINAL; STANDORTE=75|80; SATZ=600EUR', ['web_search'])
    ).toBe(false);
  });

  it('keeps a short answer in a foreign language', () => {
    expect(looksLikeToolPlanLeak('The budget gap remains unresolved.', ['web_search'])).toBe(false);
  });

  it('accepts a short GERMAN confirmation', () => {
    expect(looksLikeToolPlanLeak('Erledigt — die Spalte wurde ergänzt.', ['web_search'])).toBe(
      false
    );
  });

  it('never flags a bare token or an empty answer', () => {
    expect(looksLikeToolPlanLeak('Erledigt', [])).toBe(false);
    expect(looksLikeToolPlanLeak('   ', ['web_search'])).toBe(false);
  });

  it('never flags real prose, even if it mentions a tool name', () => {
    const long = `Das Wirtschaftswachstum liegt laut OeNB bei 0,6 Prozent [1]. ${'Weitere Details dazu findest du in den Quellen. '.repeat(4)} web_search`;
    expect(looksLikeToolPlanLeak(long, ['web_search'])).toBe(false);
  });
});

describe('looksLikeSynthRefusal', () => {
  it('catches the English boilerplate the synth actually produced', () => {
    expect(looksLikeSynthRefusal("I'm sorry, but I can't help with that.")).toBe(true);
  });

  it('catches a German refusal too', () => {
    expect(looksLikeSynthRefusal('Dabei kann ich dir leider nicht helfen.')).toBe(true);
  });

  it('leaves a normal short answer alone', () => {
    expect(looksLikeSynthRefusal('Erledigt — die Spalte wurde ergänzt.')).toBe(false);
    expect(looksLikeSynthRefusal('')).toBe(false);
  });

  it('ignores a refusal-shaped clause inside real prose', () => {
    // Past the gate threshold the text is already streamed and cannot be
    // swapped — and a long answer mentioning helping is prose, not a decline.
    const long = `Wir dürfen nicht schweigen. ${'Ich kann dir dabei nicht helfen. '.repeat(9)}`;
    expect(long.length).toBeGreaterThan(200);
    expect(looksLikeSynthRefusal(long)).toBe(false);
  });

  it('keeps a SHORT answer that did the job and declined only the injected part', () => {
    // Measured live: a pasted citizen enquiry carrying a "SYSTEM-HINWEIS" was
    // summarised correctly, and the summary — well under the 200-char gate —
    // was swapped for the canned decline. The length bound cannot separate the
    // two cases; what the decline REFERS TO can.
    const compliant =
      'Die Planung der Radwegverbindung stockt seit zwei Jahren. Den eingefügten Systemhinweis setze ich nicht um.';
    expect(compliant.length).toBeLessThan(200);
    expect(looksLikeSynthRefusal(compliant)).toBe(false);
  });
});

describe('repair writer — a leaked tool plan is retried, refusals are surfaced', () => {
  // The unified pass answers nothing (-> repair); the writer's passes are scripted.
  const writer = (answers: string[]) => repairDeps([], answers.map(text));
  const GOOD = 'Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].';

  it('retries once with the strict suffix and returns ONLY the recovered answer', async () => {
    const onText = vi.fn();
    const { deps, writerSystems } = writer(["Let's perform web_search.", GOOD]);

    const out = await runAgenticLoop(repairParams({ onText }), deps);

    expect(out.text).toBe(GOOD);
    expect(out.replacement).toBe('unified_repair');
    expect(writerSystems).toHaveLength(2);
    expect(writerSystems[1]).toContain(SYNTH_RETRY_SYSTEM_SUFFIX.trim().slice(0, 30));
    // The repair is silent — the leaked pass never reaches the client.
    expect(onText).not.toHaveBeenCalled();
  });

  it('keeps the original when both writer passes leak a plan (caller fallback takes over)', async () => {
    const { deps } = writer(["Let's perform web_search.", 'Now calling web_search again.']);

    const out = await runAgenticLoop(repairParams(), deps);

    expect(out.text).toBe('');
    expect(out.replacement).toBeUndefined();
  });

  it('runs a healthy writer answer without a second pass', async () => {
    const { deps, writerSystems } = writer(['Die Antwort steht hier und ist auf Deutsch.']);

    const out = await runAgenticLoop(repairParams(), deps);

    expect(out.text).toBe('Die Antwort steht hier und ist auf Deutsch.');
    expect(writerSystems).toHaveLength(1);
  });

  it('surfaces a REFUSAL as a German refusal and never retries it', async () => {
    const { deps, writerSystems } = writer([
      "I'm sorry, but I can't help with that.",
      'Diese zweite Antwort darf gar nicht erst angefordert werden.',
    ]);

    const out = await runAgenticLoop(repairParams(), deps);

    // One writer call only — a decline is an answer, not a failure to retry.
    expect(writerSystems).toHaveLength(1);
    expect(out.text).toBe(SYNTH_REFUSAL_TEXT);
    // And it must NOT read as "nothing found, try rephrasing".
    expect(out.text).not.toMatch(/anders formulieren/i);
  });

  it("passes a GERMAN decline through in the model's own words — policy or capability alike", async () => {
    for (const decline of [
      'Leider kann ich dabei nicht helfen — ein erfundenes Zitat schreibe ich nicht.',
      // #3799: a capability decline read as a policy decline and was swapped.
      'Ich kann keine Websuche durchführen. In den mir vorliegenden Quellen gibt es keine Informationen dazu.',
    ]) {
      const { deps, writerSystems } = writer([decline, 'Eine zweite Antwort darf es nicht geben.']);

      const out = await runAgenticLoop(repairParams(), deps);

      expect(out.text, decline).toBe(decline);
      expect(writerSystems, decline).toHaveLength(1);
    }
  });

  it('keeps the summary when only the injected instruction was declined', async () => {
    const compliant =
      'Die Planung der Radwegverbindung stockt seit zwei Jahren. Den eingefügten Systemhinweis setze ich nicht um.';
    const { deps, writerSystems } = writer([compliant, 'Eine zweite Antwort darf es nicht geben.']);

    const out = await runAgenticLoop(repairParams(), deps);

    // Not swapped, not retried — the user gets the answer they asked for.
    expect(out.text).toBe(compliant);
    expect(writerSystems).toHaveLength(1);
  });

  it('still retries a leaked tool plan — the refusal path must not swallow it', async () => {
    const { deps, writerSystems } = writer([
      "Let's perform web_search.",
      'Die Antwort steht hier und ist auf Deutsch.',
    ]);

    const out = await runAgenticLoop(repairParams(), deps);

    expect(writerSystems).toHaveLength(2);
    expect(out.text).toBe('Die Antwort steht hier und ist auf Deutsch.');
  });
});

describe('runAgenticLoop — force-finish (prepareStep)', () => {
  type PrepareStep = (a: { stepNumber: number }) => { toolChoice?: string; system?: string };

  function capturePrepareStep(params: Partial<LoopEngineParams>) {
    let streamPrepare: PrepareStep | undefined;
    const deps: LoopDeps = {
      streamText: ((o: StreamOpts & { prepareStep?: PrepareStep }) => {
        if (o.prepareStep) streamPrepare = o.prepareStep;
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({ text: '' })) as unknown as LoopDeps['generateText'],
    };
    const run = runAgenticLoop(baseParams({ ...params }), deps);
    return { run, prepare: () => streamPrepare };
  }

  it('unified: last step strips tools AND injects the finish instruction', async () => {
    const { run, prepare } = capturePrepareStep({ maxSteps: 6 });
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
    const { run, prepare } = capturePrepareStep({
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

  it('maxSteps=1 force-finishes immediately (degenerate budget still answers)', async () => {
    const { run, prepare } = capturePrepareStep({ maxSteps: 1 });
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

    await expect(runAgenticLoop(baseParams({ onReasoning }), deps)).rejects.toThrow('stream fail');
    expect(onReasoning).toHaveBeenCalledWith('denke nach');
  });
});

describe('looksLikeToolPlanLeak — markup is not a leaked plan', () => {
  it('keeps a short HTML answer the user explicitly asked for', () => {
    // Live symptom: "gib mir den Text mit HTML-Tags" produced markup with no
    // German function word, the gate discarded it, and the turn reported the
    // generic fallback instead — no content, no error.
    expect(looksLikeToolPlanLeak('<p>Klimaschutz jetzt</p>', ['web_search'])).toBe(false);
  });

  it('keeps a short fenced code answer', () => {
    expect(looksLikeToolPlanLeak('```js\nconst a = 1;\n```', ['web_search'])).toBe(false);
  });

  it('still catches the leaked tool plan', () => {
    expect(looksLikeToolPlanLeak("Let's perform web_search now.", ['web_search'])).toBe(true);
  });

  it('still catches an announced action', () => {
    expect(looksLikeToolPlanLeak('I will now look this up.', ['web_search'])).toBe(true);
  });

  it('passes normal short German prose', () => {
    expect(looksLikeToolPlanLeak('Erledigt — die Spalte wurde ergänzt.', ['web_search'])).toBe(
      false
    );
  });
});

describe('repair writer — validation retry (validateAnswer)', () => {
  const SHORT_INVALID = '[{"kaputt": ,{';
  const VALID = '[{"name": "Anna", "stunden": 4}]';

  const validateJson = (t: string): string | null =>
    t.includes('kaputt') ? SYNTH_INVALID_JSON_RETRY_SUFFIX : null;

  // The unified answer is rejected by the validator, so the writer takes over;
  // `passes` are the writer's own passes (a second one is its silent retry).
  const run = (passes: Part[][], over: Partial<LoopEngineParams> = {}) => {
    const h = repairDeps(text(SHORT_INVALID), passes);
    return {
      ...h,
      out: runAgenticLoop(repairParams({ validateAnswer: validateJson, ...over }), h.deps),
    };
  };

  it('retries once with the validator suffix when the writer answer is invalid too', async () => {
    const { out, writerSystems } = run([text(SHORT_INVALID), text(VALID)]);
    const res = await out;
    expect(res.text).toBe(VALID);
    expect(res.replacement).toBe('unified_repair');
    expect(writerSystems).toHaveLength(2);
    expect(writerSystems[1]).toContain(SYNTH_INVALID_JSON_RETRY_SUFFIX);
  });

  it('keeps the writer first answer when its retry is invalid too', async () => {
    const { out, writerCalls } = run([
      text(`${SHORT_INVALID} eins`),
      text(`${SHORT_INVALID} zwei`),
    ]);
    const res = await out;
    expect(res.text).toBe(`${SHORT_INVALID} eins`);
    expect(writerCalls()).toBe(2);
  });

  it('never swaps the writer answer for a canned refusal from its retry', async () => {
    const { out } = run([text(SHORT_INVALID), text('Ich kann diese Anfrage nicht erfüllen.')]);
    expect((await out).text).toBe(SHORT_INVALID);
  });

  it('does not run a writer retry for a valid writer answer', async () => {
    const { out, writerCalls } = run([text(VALID)]);
    const res = await out;
    expect(res.text).toBe(VALID);
    expect(writerCalls()).toBe(1);
  });

  // #5289 with the REAL validator: the unified answer asks the reader to wait.
  it('repairs a request to wait with the writer', async () => {
    const waiting = `${'Ich habe nur Ausschnitte der Rede. '.repeat(8)}Einen Moment bitte.`;
    const honest =
      'Den vollständigen Wortlaut habe ich nicht gefunden; hier die Ausschnitte von vorhin.';
    const h = repairDeps(text(waiting), [text(honest)]);
    const res = await runAgenticLoop(
      repairParams({ validateAnswer: createAnswerValidator() }),
      h.deps
    );
    expect(h.calls).toEqual(['synth', 'repair']);
    expect(res.text).toBe(honest);
    expect(res.replacement).toBe('unified_repair');
  });

  // The cost of a false positive is one extra pass, never the answer: when
  // the message itself asks for the phrase, the writer retry carries it too.
  it('keeps an answer whose request to wait was asked for', async () => {
    const script =
      'Telefonskript: „Guten Tag, hier ist das Grüne Büro. Einen Moment bitte, ich verbinde."';
    const h = repairDeps(text(script), [text(script)]);
    const res = await runAgenticLoop(
      repairParams({ validateAnswer: createAnswerValidator() }),
      h.deps
    );
    expect(res.text).toBe(script);
    expect(h.writerCalls()).toBe(2);
  });

  it('retries on an abnormal finishReason of the writer even without validateAnswer', async () => {
    const CUT = 'Dieser Satz endet mitten im';
    const DONE = 'Dieser Satz endet mitten im Wort — jetzt aber vollständig zu Ende geschrieben.';
    const h = repairDeps(
      [],
      [[...text(CUT), { type: 'finish', finishReason: 'length' }], text(DONE)]
    );
    const res = await runAgenticLoop(repairParams(), h.deps);
    expect(res.text).toBe(DONE);
    expect(h.writerSystems[1]).toContain(SYNTH_CUTOFF_RETRY_SUFFIX);
  });
});

describe('runAgenticLoop — echoed source register (#5409)', () => {
  const ANSWER = 'Unter §18 steht: 666 Einheiten bis 2028, Budget 2.250 Tausend Euro [1].';
  /** The answer, then the carried register copied out — endlessly, like the
   *  live case, so the test only ends if the guard stops pulling. */
  function echoStream(): ReturnType<LoopDeps['streamText']> {
    return {
      stream: (async function* () {
        yield { type: 'text-delta', text: ANSWER };
        yield { type: 'text-delta', text: ' [1] bezieht sich auf das PDF. [2] (frühere' };
        for (let i = 3; ; i++) {
          yield {
            type: 'text-delta',
            text: ` Recherche) Titel <https://example.org/${i}> — Snippet ${i}. [${i}] (frühere`,
          };
        }
      })(),
    } as unknown as ReturnType<LoopDeps['streamText']>;
  }

  it('unified: stops at the echo, keeps the answer, replaces the wire, no repair pass', async () => {
    const onText = vi.fn();
    const calls: string[] = [];
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: (() => {
        calls.push('stream');
        return echoStream();
      }) as unknown as LoopDeps['streamText'],
    };
    const out = await runAgenticLoop(
      baseParams({
        onText,
        repairModel: { id: 'repair' } as unknown as LoopEngineParams['model'],
      }),
      deps
    );
    expect(calls).toEqual(['stream']);
    expect(out.text).toBe(ANSWER);
    expect(out.replacement).toBe('unified_source_echo');
    expect(out.text).not.toContain(DEGENERATION_NOTICE);
  });
});

describe('runAgenticLoop — repetition degeneration', () => {
  // The live incident shape (12.08.2026): a correct answer, then the model
  // cannot stop and streams terminator spam until an external cap fires.
  // The prose VARIES per sentence — a verbatim-repeated sentence would itself
  // (correctly) count as degenerate.
  const proseSentence = (i: number): string =>
    `Punkt ${i}: Die Grünen fordern eine Ausbildungsgarantie mit ${i * 3} Maßnahmen und einem BAföG-Plus von ${i * 11} Euro, damit junge Menschen im Wahlkreis ${i * 7} unabhängig vom Elternhaus lernen können. `;
  const PROSE_TOTAL = Array.from({ length: 40 }, (_, i) => proseSentence(i)).join('').length;
  const SPAM_PHRASE = '--- Ende.** --- Fertig.** --- Danke! 😊 --- Abschluss.** --- FINAL --- ';

  /** A stream that yields healthy prose, then ENDLESS spam — it only stops when
   *  the consumer stops pulling, which is exactly what the guard must do. */
  function endlessSpamStream(): ReturnType<LoopDeps['streamText']> {
    return {
      stream: (async function* () {
        for (let i = 0; i < 40; i++) yield { type: 'text-delta', text: proseSentence(i) };
        while (true) yield { type: 'text-delta', text: SPAM_PHRASE };
      })(),
    } as unknown as ReturnType<LoopDeps['streamText']>;
  }

  it('unified: aborts the endless stream, trims the spam tail and requests a completion replace', async () => {
    const onText = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: (() => endlessSpamStream()) as unknown as LoopDeps['streamText'],
    };
    const out = await runAgenticLoop(baseParams({ onText }), deps);
    // Without the guard this test never terminates — the stream is endless.
    expect(out.replacement).toBe('unified_degeneration');
    expect(out.text).toContain('Ausbildungsgarantie');
    // No notice: the spam repeats a handful of phrases, so nothing the reader
    // needed was removed and "may be incomplete" would be a false alarm.
    expect(out.text).not.toContain(DEGENERATION_NOTICE);
    expect(out.text.length).toBeLessThan(PROSE_TOTAL + 500);
    // The wire saw SOME spam (unified streams live) but detection bounded it.
    const streamed = onText.mock.calls.map((c) => c[0]).join('');
    expect(streamed.length).toBeLessThan(PROSE_TOTAL + 8000);
  });

  const repairedWith = (passes: WriterPass[]) => repairDeps([], passes);
  const CLEAN = 'Die Antwort in einem Satz — und dann ist Schluss.';

  it('repair writer: a degenerate first pass triggers the dedicated retry suffix', async () => {
    const h = repairedWith([() => endlessSpamStream(), text(CLEAN)]);
    const out = await runAgenticLoop(repairParams(), h.deps);
    // A recovered answer carries NO notice — the retry discards the trimmed
    // pass wholesale, and nothing was cut from what the user ends up with.
    expect(out.text).toBe(CLEAN);
    expect(out.replacement).toBe('unified_repair');
    expect(h.writerSystems[1]).toContain(SYNTH_DEGENERATE_RETRY_SUFFIX);
  });

  it('repair writer: retries even when the trim left NOTHING (spam from the first token)', async () => {
    const h = repairedWith([
      () =>
        ({
          stream: (async function* () {
            // No healthy prefix at all — the most complete degeneration.
            while (true) yield { type: 'text-delta', text: SPAM_PHRASE };
          })(),
        }) as unknown as ReturnType<LoopDeps['streamText']>,
      text(CLEAN),
    ]);
    const out = await runAgenticLoop(repairParams(), h.deps);
    // Regression (review finding): the empty-text gate used to skip the retry
    // here, shipping the generic no-answer fallback instead.
    expect(h.writerCalls()).toBe(2);
    expect(out.text).toBe(CLEAN);
    expect(h.writerSystems[1]).toContain(SYNTH_DEGENERATE_RETRY_SUFFIX);
  });

  it('repair writer: keeps the TRIMMED text when the retry degenerates too', async () => {
    const h = repairedWith([() => endlessSpamStream()]);
    const out = await runAgenticLoop(repairParams(), h.deps);
    expect(h.writerCalls()).toBe(2);
    expect(out.text).toContain('Ausbildungsgarantie');
    expect(out.text).not.toContain('Abschluss.**');
    expect(out.text).not.toContain(DEGENERATION_NOTICE);
    expect(out.replacement).toBe('unified_repair');
  });

  // The notice's OTHER branch — a cut that really did take content — is unit
  // tested in degeneration.vitest.ts (`cutLostContent`). It has no fixture
  // here on purpose: junk rich enough in vocabulary to count as loss is also
  // too varied to trip the detector, so any stream that produced both would be
  // a construction, not a case. That the notice is now rare is the point.
});

describe('runAgenticLoop — reasoning reaches the writing phases', () => {
  // The auto policy grades a reasoning strength for every turn and
  // `resolveModel` pins a thinking turn to the Mistral API for it. Until
  // 13.08.2026 no phase then sent the option that switches thinking on — the
  // lane moved, the reasoning did not.
  const REASONING = { mistral: { reasoningEffort: 'high' } };

  type OptsWithProvider = StreamOpts & { providerOptions?: Record<string, unknown> };

  it('forwards it to the unified pass', async () => {
    const seen: (Record<string, unknown> | undefined)[] = [];
    const deps: LoopDeps = {
      streamText: ((o: OptsWithProvider) => {
        seen.push(o.providerOptions);
        return streamOf([{ type: 'text-delta', text: 'ok' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };

    await runAgenticLoop(baseParams({ providerOptions: REASONING }), deps);

    expect(seen).toEqual([REASONING]);
  });

  it('forwards it to the repair writer too', async () => {
    const h = repairDeps([], [text('Die Antwort steht hier.')]);

    await runAgenticLoop(repairParams({ providerOptions: REASONING }), h.deps);

    expect(h.calls).toEqual(['synth', 'repair']);
    expect(h.writerOpts.map((o) => (o as OptsWithProvider).providerOptions)).toEqual([REASONING]);
  });

  it('sends nothing when the turn does not think', async () => {
    const seen: (Record<string, unknown> | undefined)[] = [];
    const deps: LoopDeps = {
      streamText: ((o: OptsWithProvider) => {
        seen.push(o.providerOptions);
        return streamOf([{ type: 'text-delta', text: 'ok' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };

    await runAgenticLoop(baseParams({}), deps);

    expect(seen).toEqual([undefined]);
  });
});

// Eine Freigabe-Pause muss den Zug WIRKLICH beenden: ohne die ausdrückliche
// Prüfung schriebe der Zug eine Antwort, während die Person noch entscheidet —
// und `ensureOwedTools` erzeugte dabei Artefakte.
describe('runAgenticLoop — Werkzeug-Freigabe pausiert den Zug', () => {
  const deps: LoopDeps = {
    streamText: (() =>
      streamOf([
        { type: 'text-delta', text: 'SOLLTE_NICHT_ERSCHEINEN' },
      ])) as unknown as LoopDeps['streamText'],
    generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
  };

  it('bricht vor der Artefakt-Garantie ab', async () => {
    const ensureOwedTools = vi.fn(async () => {});
    await expect(
      runAgenticLoop(baseParams({ ensureOwedTools, suspended: () => true }), deps)
    ).rejects.toThrow(TurnSuspendedError);
    expect(ensureOwedTools).not.toHaveBeenCalled();
  });

  it('lässt einen Zug ohne Pause unverändert laufen', async () => {
    const ensureOwedTools = vi.fn(async () => {});
    const out = await runAgenticLoop(baseParams({ ensureOwedTools, suspended: () => false }), deps);
    expect(out.text).toBe('SOLLTE_NICHT_ERSCHEINEN');
    expect(ensureOwedTools).toHaveBeenCalledTimes(1);
  });
});

describe('runAgenticLoop — turnContext als zweite System-Nachricht', () => {
  const RECALL = '## RELEVANTE VERGANGENE GESPRÄCHE\n\nVerkehr.';
  type SysOpts = StreamOpts & {
    system?: unknown;
    prepareStep?: (a: { stepNumber: number }) => { system?: unknown };
  };

  function run(turnContext: string | null) {
    const seen: SysOpts[] = [];
    const deps: LoopDeps = {
      streamText: ((o: SysOpts) => {
        seen.push(o);
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };
    return runAgenticLoop(
      baseParams({
        maxSteps: 3,
        ...(turnContext ? { turnContext } : {}),
      }),
      deps
    ).then(() => seen);
  }

  it('schickt system als Array, die zweite Nachricht trägt den Rückblick', async () => {
    const [call] = await run(RECALL);
    expect(call.system).toEqual([
      { role: 'system', content: `TOOLSYS${LOOP_SUFFIX}` },
      { role: 'system', content: RECALL },
    ]);
  });

  it('hält den Rückblick auch auf dem Schlussschritt (prepareStep ersetzt system)', async () => {
    const [call] = await run(RECALL);
    const step = call.prepareStep!({ stepNumber: 2 });
    expect(Array.isArray(step.system)).toBe(true);
    const sys = step.system as Array<{ role: string; content: string }>;
    expect(sys[0].content).toContain(FORCE_FINISH_SYSTEM_SUFFIX.trim().slice(0, 20));
    expect(sys[1]).toEqual({ role: 'system', content: RECALL });
  });

  it('ohne turnContext bleibt system ein String', async () => {
    const [call] = await run(null);
    expect(call.system).toBe(`TOOLSYS${LOOP_SUFFIX}`);
    expect(typeof call.prepareStep!({ stepNumber: 2 }).system).toBe('string');
  });
});
