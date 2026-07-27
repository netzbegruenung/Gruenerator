import { describe, it, expect, vi } from 'vitest';

import {
  runAgenticLoop,
  buildPrepareStep,
  createSentenceChunker,
  looksDegenerateSynth,
  FORCE_FINISH_SYSTEM_SUFFIX,
  FORCE_FINISH_GATHER_SUFFIX,
  SYNTH_RETRY_SYSTEM_SUFFIX,
  type LoopDeps,
  type LoopEngineParams,
} from './loopEngine.js';

import type { ModelMessage } from 'ai';

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
type StreamOpts = {
  model: { id: string };
  tools?: Record<string, { execute?: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }>;
  system?: string;
};
// `before` simulates the real SDK's tool loop: the tool call happens WHILE the
// stream is being drained (gather consumes result.stream), not before.
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
  it('planner gathers (streamText+tools) then the SELECTED model synthesizes (streamText, no tools)', async () => {
    const order: string[] = [];
    const onText = vi.fn();
    let synthSystem = '';
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        const phase = o.model.id === 'planner' ? 'gather' : 'synth';
        order.push(`${phase}:${o.model.id}:tools=${!!o.tools}`);
        if (phase === 'synth') synthSystem = o.system ?? '';
        return streamOf([
          {
            type: 'text-delta',
            text: phase === 'gather' ? 'PLANNER_DRAFT_DISCARDED' : 'SYNTH_ANSWER',
          },
        ]);
      }) as unknown as LoopDeps['streamText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'split', onText }), deps);

    // The user-facing answer comes from the synth model; the planner's draft is
    // never routed to onText (with no onNarration it is drained silently).
    expect(out.text).toBe('SYNTH_ANSWER');
    expect(onText).toHaveBeenCalledWith('SYNTH_ANSWER');
    expect(onText).not.toHaveBeenCalledWith('PLANNER_DRAFT_DISCARDED');
    // Order + which model + tools-per-phase (gather has tools, synth does not).
    expect(order).toEqual(['gather:planner:tools=true', 'synth:synth:tools=false']);
    // Gathered sources are injected into the (tool-less) synth context.
    expect(synthSystem).toContain('[1] Quelle');
  });

  it('runs the tool loop on the planner (gather drains its stream, executing tools)', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: true });
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') {
          return streamOf([{ type: 'text-delta', text: '' }], async () => {
            await o.tools?.probe?.execute?.({}, { toolCallId: 'c1' });
          });
        }
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
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

  it('drains the whole planner stream even without onNarration (so the tool loop runs)', async () => {
    let consumed = 0;
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') {
          return {
            stream: (async function* () {
              for (const part of [
                { type: 'text-delta', text: 'a. ' },
                { type: 'reasoning-delta', text: 'r' },
                { type: 'text-delta', text: 'b.' },
              ]) {
                consumed += 1;
                yield part;
              }
            })(),
          } as unknown as ReturnType<LoopDeps['streamText']>;
        }
        return streamOf([{ type: 'text-delta', text: 'X' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split' }), deps); // no onNarration

    expect(consumed).toBe(3);
  });

  it('degrades to synthesis when the gather phase errors (partial evidence still answers)', async () => {
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') {
          return streamOf([{ type: 'error', error: new Error('planner boom') }]);
        }
        return streamOf([{ type: 'text-delta', text: 'RECOVERED' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'split' }), deps);

    expect(out.text).toBe('RECOVERED');
  });
});

describe('synthMessages — the tool replay must not reach the tool-less synth', () => {
  const userMsg: ModelMessage = { role: 'user', content: 'recherchiere X' };
  const replayAssistant: ModelMessage = {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'web_search', input: {} }],
  };

  it('gather gets the replay history, synth gets the plain one', async () => {
    const seen: Record<string, ModelMessage[]> = {};
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts & { messages: ModelMessage[] }) => {
        seen[o.model.id] = o.messages;
        return streamOf([{ type: 'text-delta', text: 'Die Antwort steht hier.' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(
      baseParams({
        mode: 'split',
        messages: [replayAssistant, userMsg],
        synthMessages: [userMsg],
      }),
      deps
    );

    expect(seen['planner']).toHaveLength(2);
    // Regression: with the replay in its context and no tools mounted, the synth
    // imitated the tool-call pattern ("Let's perform web_search.") instead of answering.
    expect(seen['synth']).toEqual([userMsg]);
  });

  it('falls back to `messages` when synthMessages is omitted', async () => {
    const seen: Record<string, ModelMessage[]> = {};
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts & { messages: ModelMessage[] }) => {
        seen[o.model.id] = o.messages;
        return streamOf([{ type: 'text-delta', text: 'Die Antwort steht hier.' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', messages: [userMsg] }), deps);

    expect(seen['synth']).toEqual([userMsg]);
  });
});

describe('looksDegenerateSynth', () => {
  it('flags the observed live failure (short, English, names a mounted tool)', () => {
    expect(looksDegenerateSynth("Let's perform web_search.", ['web_search'])).toBe(true);
  });

  it('flags a short non-German sentence even without a tool name', () => {
    expect(looksDegenerateSynth('I will search for that now.', [])).toBe(true);
  });

  it('accepts a short GERMAN confirmation', () => {
    expect(looksDegenerateSynth('Erledigt — die Spalte wurde ergänzt.', ['web_search'])).toBe(
      false
    );
  });

  it('never flags a bare token or an empty answer', () => {
    expect(looksDegenerateSynth('Erledigt', [])).toBe(false);
    expect(looksDegenerateSynth('   ', ['web_search'])).toBe(false);
  });

  it('never flags real prose, even if it mentions a tool name', () => {
    const long = `Das Wirtschaftswachstum liegt laut OeNB bei 0,6 Prozent [1]. ${'Weitere Details dazu findest du in den Quellen. '.repeat(4)} web_search`;
    expect(looksDegenerateSynth(long, ['web_search'])).toBe(false);
  });
});

describe('split synthesis — degenerate answer is retried, never streamed', () => {
  function synthDeps(answers: string[]): { deps: LoopDeps; systems: string[] } {
    const systems: string[] = [];
    let call = 0;
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') return streamOf([{ type: 'text-delta', text: '' }]);
        systems.push(o.system ?? '');
        const text = answers[Math.min(call, answers.length - 1)] ?? '';
        call += 1;
        return streamOf(text.length > 0 ? [{ type: 'text-delta', text }] : []);
      }) as unknown as LoopDeps['streamText'],
    };
    return { deps, systems };
  }

  const tools = { web_search: {} } as unknown as LoopEngineParams['tools'];

  it('retries once with the strict suffix and streams ONLY the recovered answer', async () => {
    const onText = vi.fn();
    const { deps, systems } = synthDeps([
      "Let's perform web_search.",
      'Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].',
    ]);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    expect(out.text).toBe('Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].');
    expect(systems).toHaveLength(2);
    expect(systems[1]).toContain(SYNTH_RETRY_SYSTEM_SUFFIX.trim().slice(0, 30));
    // The degenerate first pass stayed buffered — the client never saw it.
    const streamed = onText.mock.calls.map((c) => c[0] as string).join('');
    expect(streamed).toBe('Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].');
    expect(streamed).not.toContain('web_search');
  });

  it('emits nothing at all when both passes degenerate (caller fallback takes over)', async () => {
    const onText = vi.fn();
    const { deps } = synthDeps(["Let's perform web_search.", 'Now calling web_search again.']);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    expect(out.text).toBe('');
    expect(onText).not.toHaveBeenCalled();
  });

  it('streams a healthy answer without a second pass', async () => {
    const onText = vi.fn();
    const { deps, systems } = synthDeps(['Die Antwort steht hier und ist auf Deutsch.']);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    expect(out.text).toBe('Die Antwort steht hier und ist auf Deutsch.');
    expect(systems).toHaveLength(1);
    expect(onText).toHaveBeenCalledWith('Die Antwort steht hier und ist auf Deutsch.');
  });

  it('opens the gate mid-stream for a long answer (no full-answer buffering)', async () => {
    const onText = vi.fn();
    const tail = ' und hier kommt der Rest der Antwort.';
    // Longer than the 200-char gate threshold, so the gate opens mid-stream.
    const head = 'Das Wachstum liegt laut OeNB bei 0,6 Prozent. '.repeat(6);
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) =>
        o.model.id === 'planner'
          ? streamOf([{ type: 'text-delta', text: '' }])
          : streamOf([
              { type: 'text-delta', text: head },
              { type: 'text-delta', text: tail },
            ])) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    // First flush carries the buffered head; once open, later deltas pass through
    // one by one instead of being held to the end.
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenLastCalledWith(tail);
  });
});

describe('runAgenticLoop — split gather narration', () => {
  it('streams planner prose to onNarration sentence-wise, NOT to onText', async () => {
    const onNarration = vi.fn();
    const onText = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') {
          return streamOf([
            { type: 'text-delta', text: 'Ich suche ' },
            { type: 'text-delta', text: 'im Wahlprogramm. ' },
            { type: 'text-delta', text: 'Jetzt prüfe ich die Quelle.' },
          ]);
        }
        return streamOf([{ type: 'text-delta', text: 'FINAL' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', onNarration, onText }), deps);

    expect(onNarration).toHaveBeenCalledWith('Ich suche im Wahlprogramm.');
    expect(onNarration).toHaveBeenCalledWith('Jetzt prüfe ich die Quelle.');
    // Narration must never leak into the answer channel.
    expect(onText).not.toHaveBeenCalledWith('Ich suche im Wahlprogramm.');
    expect(onText).toHaveBeenCalledWith('FINAL');
  });

  it('flushes the narration buffered up to a stream error, then degrades without throwing', async () => {
    const onNarration = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') {
          return streamOf([
            { type: 'text-delta', text: 'Erster Schritt. ' },
            { type: 'error', error: new Error('boom') },
            { type: 'text-delta', text: 'nie erreicht' },
          ]);
        }
        return streamOf([{ type: 'text-delta', text: 'SYNTH' }]);
      }) as unknown as LoopDeps['streamText'],
    };

    const out = await runAgenticLoop(baseParams({ mode: 'split', onNarration }), deps);

    expect(out.text).toBe('SYNTH');
    expect(onNarration).toHaveBeenCalledWith('Erster Schritt.');
    expect(onNarration).not.toHaveBeenCalledWith('nie erreicht');
  });

  it('flushes a trailing partial (punctuation-free) sentence at phase end', async () => {
    const onNarration = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) =>
        o.model.id === 'planner'
          ? streamOf([{ type: 'text-delta', text: 'Kein Satzende hier' }])
          : streamOf([{ type: 'text-delta', text: 'S' }])) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', onNarration }), deps);

    expect(onNarration).toHaveBeenCalledWith('Kein Satzende hier');
  });
});

describe('runAgenticLoop — force-finish (prepareStep)', () => {
  type PrepareStep = (a: { stepNumber: number }) => { toolChoice?: string; system?: string };

  function capturePrepareStep(mode: 'unified' | 'split', params: Partial<LoopEngineParams>) {
    // Both modes drive tools via streamText now (unified: the one pass; split:
    // the gather pass). Synthesis streamText carries no prepareStep, so capture
    // the call that actually has one.
    let streamPrepare: PrepareStep | undefined;
    const deps: LoopDeps = {
      streamText: ((o: StreamOpts & { prepareStep?: PrepareStep }) => {
        if (o.prepareStep) streamPrepare = o.prepareStep;
        return streamOf([{ type: 'text-delta', text: 'A' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({ text: '' })) as unknown as LoopDeps['generateText'],
    };
    const run = runAgenticLoop(baseParams({ mode, ...params }), deps);
    return { run, prepare: () => streamPrepare };
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

describe('createSentenceChunker', () => {
  function collect(): { c: ReturnType<typeof createSentenceChunker>; out: string[] } {
    const out: string[] = [];
    return { c: createSentenceChunker((s) => out.push(s)), out };
  }

  it('flushes on a sentence-end char followed by whitespace', () => {
    const { c, out } = collect();
    c.push('Hallo Welt. ');
    expect(out).toEqual(['Hallo Welt.']);
  });

  it('treats . ! ? … : as sentence ends', () => {
    for (const [text, expected] of [
      ['Punkt. ', 'Punkt.'],
      ['Ruf! ', 'Ruf!'],
      ['Frage? ', 'Frage?'],
      ['Ellipse… ', 'Ellipse…'],
      ['Doppelpunkt: ', 'Doppelpunkt:'],
    ] as const) {
      const { c, out } = collect();
      c.push(text);
      expect(out).toEqual([expected]);
    }
  });

  it('flushes on a sentence end at the very end of the buffer (no trailing space)', () => {
    const { c, out } = collect();
    c.push('Satz zu Ende.');
    expect(out).toEqual(['Satz zu Ende.']);
  });

  it('flushes on a newline and buffers the remainder', () => {
    const { c, out } = collect();
    c.push('Zeile eins\nZeile zwei');
    expect(out).toEqual(['Zeile eins']);
    c.flush();
    expect(out).toEqual(['Zeile eins', 'Zeile zwei']);
  });

  it('flushes when the buffer grows past 160 chars without a boundary', () => {
    const { c, out } = collect();
    const long = 'a'.repeat(200);
    c.push(long);
    expect(out).toEqual([long]);
  });

  it('trims each emitted sentence and drops empty/whitespace-only deltas', () => {
    const { c, out } = collect();
    c.push('   ');
    c.push('');
    expect(out).toEqual([]);
    c.push('   Wort.   ');
    expect(out).toEqual(['Wort.']);
  });

  it('emits only up to a mid-buffer sentence end and keeps the rest', () => {
    const { c, out } = collect();
    c.push('Erster Satz. Zweiter');
    expect(out).toEqual(['Erster Satz.']);
    c.flush();
    expect(out).toEqual(['Erster Satz.', 'Zweiter']);
  });

  it('reassembles a sentence split across multiple deltas', () => {
    const { c, out } = collect();
    c.push('Ich suche ');
    c.push('im Wahlprogramm. ');
    expect(out).toEqual(['Ich suche im Wahlprogramm.']);
  });

  it('flush() emits the trailing buffer; flush() on an empty buffer emits nothing', () => {
    const { c, out } = collect();
    c.push('Ohne Ende');
    expect(out).toEqual([]);
    c.flush();
    expect(out).toEqual(['Ohne Ende']);
    c.flush();
    expect(out).toEqual(['Ohne Ende']);
  });
});
