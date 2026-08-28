import { describe, it, expect, vi } from 'vitest';

import {
  runAgenticLoop,
  buildPrepareStep,
  createSentenceChunker,
  looksLikeToolPlanLeak,
  looksLikeSynthRefusal,
  FORCE_FINISH_SYSTEM_SUFFIX,
  FORCE_FINISH_GATHER_SUFFIX,
  SYNTH_RETRY_SYSTEM_SUFFIX,
  SYNTH_REFUSAL_TEXT,
  SYNTH_CUTOFF_RETRY_SUFFIX,
  SYNTH_INVALID_JSON_RETRY_SUFFIX,
  SYNTH_DEGENERATE_RETRY_SUFFIX,
  type LoopDeps,
  type LoopEngineParams,
} from './loopEngine.js';
import { DEGENERATION_NOTICE } from './degeneration.js';

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
    });
    // Danach entscheidet wieder der Planer.
    expect(prep({ stepNumber: 1 })).toEqual({});
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
});

describe('buildPrepareStep — forced fallback tool', () => {
  const never = () => false;

  it('names the tool instead of merely requiring one', () => {
    // `required` would let the planner re-run the internal search that just
    // came back empty — which is exactly the loop the fallback has to break.
    const prep = buildPrepareStep('sys', 'suffix', 5, never, false, () => 'web_search');
    expect(prep({ stepNumber: 1 })).toEqual({
      toolChoice: { type: 'tool', toolName: 'web_search' },
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

// Fake models are opaque tags — the engine only forwards them to
// streamText/generateText, and the injected fakes read `.id` to assert which
// model drove which phase.
const plannerModel = { id: 'planner' } as unknown as LoopEngineParams['plannerModel'];
const synthModel = { id: 'synth' } as unknown as LoopEngineParams['synthModel'];

type Part = { type: string; text?: string; error?: unknown; finishReason?: string };
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

  /**
   * The 20.08.2026 stall: the planner went silent after its last tool returned
   * and nothing in the loop noticed. The effective deadline was GreenPT's own
   * 120s fetch timeout — the turn finished in 139.7s.
   *
   * Silence is only a hang once nothing could legitimately still be running, so
   * the window is derived from the longest per-call timeout among the tools
   * MOUNTED THIS TURN (see `mountedToolCeilingMs`).
   */
  describe('gather stall guard', () => {
    it('gives up on a silent planner and still answers from what was gathered', async () => {
      vi.useFakeTimers();
      try {
        const deps: LoopDeps = {
          generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
          streamText: ((o: StreamOpts) => {
            if (o.model.id === 'planner') {
              // Accepts the request, then never yields anything.
              return {
                stream: (async function* () {
                  await new Promise(() => {});
                })(),
              } as unknown as ReturnType<LoopDeps['streamText']>;
            }
            return streamOf([{ type: 'text-delta', text: 'RECOVERED' }]);
          }) as unknown as LoopDeps['streamText'],
        };

        const pending = runAgenticLoop(
          baseParams({ mode: 'split', abortSignal: new AbortController().signal }),
          deps
        );
        // No tools mounted → the tight window (per-call timeout + slack = 35s).
        await vi.advanceTimersByTimeAsync(40_000);

        expect((await pending).text).toBe('RECOVERED');
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits out a slow tool instead of calling it a stall', async () => {
      vi.useFakeTimers();
      try {
        const deps: LoopDeps = {
          generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
          streamText: ((o: StreamOpts) => {
            if (o.model.id === 'planner') {
              // 80s of silence — legitimate while `create_pdf` (90s cap) runs.
              return streamOf([{ type: 'text-delta', text: 'plane…' }], () =>
                vi.advanceTimersByTimeAsync(80_000)
              );
            }
            return streamOf([{ type: 'text-delta', text: 'FERTIG' }]);
          }) as unknown as LoopDeps['streamText'],
        };

        const pending = runAgenticLoop(
          baseParams({
            mode: 'split',
            // Mounting the generation tool is what buys the wider window.
            tools: { create_pdf: {} } as unknown as LoopEngineParams['tools'],
            abortSignal: new AbortController().signal,
          }),
          deps
        );
        await vi.advanceTimersByTimeAsync(120_000);

        expect((await pending).text).toBe('FERTIG');
      } finally {
        vi.useRealTimers();
      }
    });
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

describe('split synthesis — a leaked tool plan is retried, never streamed', () => {
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
    // The leaked first pass stayed buffered — the client never saw it.
    const streamed = onText.mock.calls.map((c) => c[0] as string).join('');
    expect(streamed).toBe('Das Wachstum liegt laut OeNB bei 0,6 Prozent [1].');
    expect(streamed).not.toContain('web_search');
  });

  it('emits nothing at all when both passes leak a plan (caller fallback takes over)', async () => {
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

  it('surfaces a REFUSAL as a German refusal and never retries it', async () => {
    const onText = vi.fn();
    const { deps, systems } = synthDeps([
      "I'm sorry, but I can't help with that.",
      'Diese zweite Antwort darf gar nicht erst angefordert werden.',
    ]);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    // One synth call only — a decline is an answer, not a failure to retry.
    expect(systems).toHaveLength(1);
    expect(out.text).toBe(SYNTH_REFUSAL_TEXT);
    expect(onText).toHaveBeenCalledWith(SYNTH_REFUSAL_TEXT);
    // The English boilerplate stayed buffered and never reached the client.
    const streamed = onText.mock.calls.map((c) => c[0] as string).join('');
    expect(streamed).not.toMatch(/i'?m sorry/i);
    // And it must NOT read as "nothing found, try rephrasing".
    expect(out.text).not.toMatch(/anders formulieren/i);
  });

  it('streams the summary when only the injected instruction was declined', async () => {
    const onText = vi.fn();
    const compliant =
      'Die Planung der Radwegverbindung stockt seit zwei Jahren. Den eingefügten Systemhinweis setze ich nicht um.';
    const { deps, systems } = synthDeps([compliant, 'Eine zweite Antwort darf es nicht geben.']);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    // Not swapped, not retried — the user gets the answer they asked for.
    expect(out.text).toBe(compliant);
    expect(systems).toHaveLength(1);
    expect(onText).toHaveBeenCalledWith(compliant);
    expect(out.text).not.toBe(SYNTH_REFUSAL_TEXT);
  });

  it('still retries a leaked tool plan — the refusal path must not swallow it', async () => {
    const onText = vi.fn();
    const { deps, systems } = synthDeps([
      "Let's perform web_search.",
      'Die Antwort steht hier und ist auf Deutsch.',
    ]);

    const out = await runAgenticLoop(baseParams({ mode: 'split', tools, onText }), deps);

    expect(systems).toHaveLength(2);
    expect(out.text).toBe('Die Antwort steht hier und ist auf Deutsch.');
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

  it('forwards the planner’s thinking — the tool phase used to have none', async () => {
    // Split mode runs the thinking lanes (GreenPT/Regolo gpt-oss). Dropping the
    // gather reasoning left every one of those turns with an empty "Gedanken"
    // panel until the answer was already being written.
    const onReasoning = vi.fn();
    const onText = vi.fn();
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) =>
        o.model.id === 'planner'
          ? streamOf([
              { type: 'reasoning-delta', text: 'Ich brauche erst die Quelle.' },
              { type: 'text-delta', text: 'Ich suche.' },
            ])
          : streamOf([
              { type: 'reasoning-delta', text: 'Jetzt formulieren.' },
              { type: 'text-delta', text: 'FINAL' },
            ])) as unknown as LoopDeps['streamText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', onReasoning, onText }), deps);

    expect(onReasoning).toHaveBeenCalledWith('Ich brauche erst die Quelle.');
    expect(onReasoning).toHaveBeenCalledWith('Jetzt formulieren.');
    // The planner's thinking is thinking, not answer text.
    expect(onText).not.toHaveBeenCalledWith('Ich brauche erst die Quelle.');
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

describe('runAgenticLoop — split validation retry (validateAnswer)', () => {
  const LONG_INVALID = `${'Viel Text vorab. '.repeat(20)}[{"kaputt": ,{`; // > 200 chars, gate open
  const SHORT_INVALID = '[{"kaputt": ,{';
  const VALID = '[{"name": "Anna", "stunden": 4}]';

  /** streamText fake: planner streams nothing useful; synth pass N streams
   *  synthTexts[N]. Records each synth call's system prompt. */
  function synthSequence(synthTexts: string[], finishReasons: (string | null)[] = []) {
    const synthSystems: string[] = [];
    let synthCall = 0;
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') return streamOf([]);
        const idx = synthCall++;
        synthSystems.push(o.system ?? '');
        const parts: Part[] = [{ type: 'text-delta', text: synthTexts[idx] ?? '' }];
        const fr = finishReasons[idx];
        if (fr) parts.push({ type: 'finish', finishReason: fr });
        return streamOf(parts);
      }) as unknown as LoopDeps['streamText'],
    };
    return { deps, synthSystems, calls: () => synthCall };
  }

  const validateJson = (t: string): string | null =>
    t.includes('kaputt') ? SYNTH_INVALID_JSON_RETRY_SUFFIX : null;

  it('swaps a still-buffered invalid answer silently for the valid retry', async () => {
    const { deps, synthSystems, calls } = synthSequence([SHORT_INVALID, VALID]);
    const onText = vi.fn();
    const out = await runAgenticLoop(baseParams({ onText, validateAnswer: validateJson }), deps);
    expect(out.text).toBe(VALID);
    expect(out.replacedStreamed).toBeUndefined();
    // Der Tausch muss aus dem Ergebnis ablesbar bleiben: er ist die stärkste
    // Änderung an dem, was ein Mensch liest, und sonst im Betrieb spurlos.
    expect(out.replacement).toBe('validation_retry');
    // The invalid pass never reached the client — only the retry did.
    const streamed = onText.mock.calls.map((c) => c[0]).join('');
    expect(streamed).toBe(VALID);
    expect(calls()).toBe(2);
    expect(synthSystems[1]).toContain(SYNTH_INVALID_JSON_RETRY_SUFFIX);
  });

  it('flags an already-streamed invalid answer for completion replacement', async () => {
    const { deps } = synthSequence([LONG_INVALID, VALID]);
    const onText = vi.fn();
    const out = await runAgenticLoop(baseParams({ onText, validateAnswer: validateJson }), deps);
    expect(out.text).toBe(VALID);
    expect(out.replacedStreamed).toBe(true);
    expect(out.replacement).toBe('validation_retry_streamed');
    // The invalid pass was on the wire; the retry itself stays silent.
    const streamed = onText.mock.calls.map((c) => c[0]).join('');
    expect(streamed).toBe(LONG_INVALID);
  });

  it('keeps the first answer when the retry is invalid too', async () => {
    const { deps, calls } = synthSequence([SHORT_INVALID, SHORT_INVALID]);
    const onText = vi.fn();
    const out = await runAgenticLoop(baseParams({ onText, validateAnswer: validateJson }), deps);
    expect(out.text).toBe(SHORT_INVALID);
    expect(out.replacedStreamed).toBeUndefined();
    expect(out.replacement).toBeUndefined();
    expect(calls()).toBe(2);
    // First answer flushes after the failed retry — nothing is lost.
    expect(onText.mock.calls.map((c) => c[0]).join('')).toBe(SHORT_INVALID);
  });

  it('never swaps a streamed answer for a canned refusal from the retry', async () => {
    const { deps } = synthSequence([SHORT_INVALID, 'Ich kann diese Anfrage nicht erfüllen.']);
    const out = await runAgenticLoop(baseParams({ validateAnswer: validateJson }), deps);
    expect(out.text).toBe(SHORT_INVALID);
  });

  it('does not run a second pass for a valid answer', async () => {
    const { deps, calls } = synthSequence([VALID]);
    const out = await runAgenticLoop(baseParams({ validateAnswer: validateJson }), deps);
    expect(out.text).toBe(VALID);
    expect(calls()).toBe(1);
  });

  it('retries on an abnormal finishReason even without validateAnswer', async () => {
    const CUT = 'Dieser Satz endet mitten im';
    const DONE = 'Dieser Satz endet mitten im Wort — jetzt aber vollständig zu Ende geschrieben.';
    const { deps, synthSystems } = synthSequence([CUT, DONE], ['length', null]);
    const out = await runAgenticLoop(baseParams({}), deps);
    expect(out.text).toBe(DONE);
    expect(synthSystems[1]).toContain(SYNTH_CUTOFF_RETRY_SUFFIX);
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
    const out = await runAgenticLoop(baseParams({ mode: 'unified', onText }), deps);
    // Without the guard this test never terminates — the stream is endless.
    expect(out.replacedStreamed).toBe(true);
    expect(out.text).toContain('Ausbildungsgarantie');
    // No notice: the spam repeats a handful of phrases, so nothing the reader
    // needed was removed and "may be incomplete" would be a false alarm.
    expect(out.text).not.toContain(DEGENERATION_NOTICE);
    expect(out.text.length).toBeLessThan(PROSE_TOTAL + 500);
    // The wire saw SOME spam (unified streams live) but detection bounded it.
    const streamed = onText.mock.calls.map((c) => c[0]).join('');
    expect(streamed.length).toBeLessThan(PROSE_TOTAL + 8000);
  });

  it('split: a degenerate first pass triggers the dedicated retry suffix and a completion replace', async () => {
    const synthSystems: string[] = [];
    let synthCall = 0;
    const CLEAN = 'Die Antwort in einem Satz — und dann ist Schluss.';
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') return streamOf([]);
        synthSystems.push(o.system ?? '');
        if (synthCall++ === 0) return endlessSpamStream();
        return streamOf([{ type: 'text-delta', text: CLEAN }]);
      }) as unknown as LoopDeps['streamText'],
    };
    const out = await runAgenticLoop(baseParams({}), deps);
    // A recovered answer carries NO notice — the retry discards the trimmed
    // pass wholesale, and nothing was cut from what the user ends up with.
    expect(out.text).toBe(CLEAN);
    // The degenerate pass had already opened the gate → completion replace.
    expect(out.replacedStreamed).toBe(true);
    expect(synthSystems[1]).toContain(SYNTH_DEGENERATE_RETRY_SUFFIX);
  });

  it('split: retries even when the trim left NOTHING (spam from the first token)', async () => {
    const synthSystems: string[] = [];
    let synthCall = 0;
    const CLEAN = 'Die Antwort in einem Satz — und dann ist Schluss.';
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') return streamOf([]);
        synthSystems.push(o.system ?? '');
        if (synthCall++ === 0) {
          // No healthy prefix at all — the most complete degeneration.
          return {
            stream: (async function* () {
              while (true) yield { type: 'text-delta', text: SPAM_PHRASE };
            })(),
          } as unknown as ReturnType<LoopDeps['streamText']>;
        }
        return streamOf([{ type: 'text-delta', text: CLEAN }]);
      }) as unknown as LoopDeps['streamText'],
    };
    const out = await runAgenticLoop(baseParams({}), deps);
    // Regression (review finding): the empty-text gate used to skip the retry
    // here, shipping the generic no-answer fallback instead.
    expect(synthCall).toBe(2);
    expect(out.text).toBe(CLEAN);
    expect(out.replacedStreamed).toBe(true);
    expect(synthSystems[1]).toContain(SYNTH_DEGENERATE_RETRY_SUFFIX);
  });

  it('split: keeps the TRIMMED text and still replaces the wire when the retry degenerates too', async () => {
    let synthCall = 0;
    const deps: LoopDeps = {
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
      streamText: ((o: StreamOpts) => {
        if (o.model.id === 'planner') return streamOf([]);
        synthCall++;
        return endlessSpamStream();
      }) as unknown as LoopDeps['streamText'],
    };
    const out = await runAgenticLoop(baseParams({}), deps);
    expect(synthCall).toBe(2);
    expect(out.text).toContain('Ausbildungsgarantie');
    expect(out.text).not.toContain('Abschluss.**');
    expect(out.text).not.toContain(DEGENERATION_NOTICE);
    expect(out.replacedStreamed).toBe(true);
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

    await runAgenticLoop(baseParams({ mode: 'unified', providerOptions: REASONING }), deps);

    expect(seen).toEqual([REASONING]);
  });

  it('forwards it to the synth pass but NOT to the planner', async () => {
    // The planner is a fixed lane reached through an OpenAI-compat client — a
    // `mistral` block would be dropped there in silence, and the planner has no
    // prose to think about anyway.
    const seen: { model: string; providerOptions?: Record<string, unknown> }[] = [];
    const deps: LoopDeps = {
      streamText: ((o: OptsWithProvider) => {
        seen.push({
          model: o.model.id,
          ...(o.providerOptions && { providerOptions: o.providerOptions }),
        });
        return streamOf([{ type: 'text-delta', text: 'ok' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', providerOptions: REASONING }), deps);

    expect(seen).toEqual([{ model: 'planner' }, { model: 'synth', providerOptions: REASONING }]);
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

    await runAgenticLoop(baseParams({ mode: 'unified' }), deps);

    expect(seen).toEqual([undefined]);
  });
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

    await runAgenticLoop(baseParams({ mode: 'unified', providerOptions: REASONING }), deps);

    expect(seen).toEqual([REASONING]);
  });

  it('forwards it to the synth pass but NOT to the planner', async () => {
    // The planner is a fixed lane reached through an OpenAI-compat client — a
    // `mistral` block would be dropped there in silence, and the planner has no
    // prose to think about anyway.
    const seen: { model: string; providerOptions?: Record<string, unknown> }[] = [];
    const deps: LoopDeps = {
      streamText: ((o: OptsWithProvider) => {
        seen.push({
          model: o.model.id,
          ...(o.providerOptions && { providerOptions: o.providerOptions }),
        });
        return streamOf([{ type: 'text-delta', text: 'ok' }]);
      }) as unknown as LoopDeps['streamText'],
      generateText: (() => Promise.resolve({})) as unknown as LoopDeps['generateText'],
    };

    await runAgenticLoop(baseParams({ mode: 'split', providerOptions: REASONING }), deps);

    expect(seen).toEqual([{ model: 'planner' }, { model: 'synth', providerOptions: REASONING }]);
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

    await runAgenticLoop(baseParams({ mode: 'unified' }), deps);

    expect(seen).toEqual([undefined]);
  });
});
