/**
 * Die Hooks um die Werkzeugausführung. Eigene Datei, weil `wrapTools.vitest.ts`
 * beweisen soll, dass sich ohne konfigurierte Hooks NICHTS ändert — sie bleibt
 * dafür unangetastet.
 */
import { describe, it, expect, vi } from 'vitest';

import { createToolLoopGuards } from './loopGuards.js';
import { type PersistedStep } from './types.js';
import {
  composeToolHooks,
  wrapToolsForLoop,
  type ToolHooks,
  type WrapToolsContext,
} from './wrapTools.js';

import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

interface RecordedEvent {
  event: string;
  data: Record<string, unknown>;
}

function makeCtx(overrides: Partial<WrapToolsContext> = {}): {
  ctx: WrapToolsContext;
  events: RecordedEvent[];
  steps: PersistedStep[];
} {
  const events: RecordedEvent[] = [];
  const steps: PersistedStep[] = [];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => events.push({ event, data }),
  } as unknown as SSEWriter;
  const ctx: WrapToolsContext = {
    sse,
    guards: createToolLoopGuards(),
    recordStep: (s) => steps.push(s),
    perCallTimeoutMs: 1000,
    ...overrides,
  };
  return { ctx, events, steps };
}

function run(tools: ToolSet, name: string, input: unknown, callId = 'call_1'): Promise<unknown> {
  const exec = (
    tools[name] as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }
  ).execute;
  return exec(input, { toolCallId: callId });
}

describe('wrapToolsForLoop — Hooks', () => {
  /**
   * Der Grund, warum diese Phase risikoarm ist: ohne Handler wird nicht
   * zusätzlich gewartet. `execute` läuft noch im synchronen Vorlauf von
   * `wrappedExecute` — genau die Eigenschaft, an der auch der Duplikat-Guard
   * hängt (parallele identische Aufrufe). Ein unbedingtes `await` vor der
   * Ausführung macht diesen Test rot.
   */
  it('ohne Hooks bleibt der synchrone Vorlauf bis execute erhalten', async () => {
    const { ctx } = makeCtx();
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const pending = run(tools, 'search', { query: 'x' });
    expect(execute).toHaveBeenCalledTimes(1);
    await pending;
  });

  it('ohne Hooks: Karte, Schritt und Rückgabe unverändert', async () => {
    const { ctx, events, steps } = makeCtx();
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [1, 2] }) } } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(out.results).toHaveLength(2);
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
    expect(steps).toHaveLength(1);
  });

  it('mock() ersetzt die Ausführung — Karte und Persistenz laufen trotzdem', async () => {
    const execute = vi.fn(async () => ({ results: ['echt'] }));
    const hooks: ToolHooks = {
      beforeToolCall: (e) => e.mock({ results: ['attrappe'] }),
    };
    const { ctx, events, steps } = makeCtx({ hooks });
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(execute).not.toHaveBeenCalled();
    expect(out.results).toEqual(['attrappe']);
    // Ohne Karte und Schritt zerfiele die Oberfläche und die Persistenz sähe
    // einen Turn ohne diesen Schritt.
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
    expect(events[1].data).toMatchObject({ ok: true, summary: '1 Ergebnisse' });
    expect(steps[0]).toMatchObject({ toolName: 'search', result: { results: ['attrappe'] } });
  });

  it('afterToolCall sieht mocked=true', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const hooks: ToolHooks = {
      beforeToolCall: (e) => e.mock({ ok: true }),
      afterToolCall: (e) => seen.push({ ...e }),
    };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      toolName: 'search',
      stepId: 'call_1',
      ok: true,
      mocked: true,
      args: { query: 'x' },
    });
    expect(typeof seen[0].durationMs).toBe('number');
  });

  it('afterToolCall läuft auch für einen echt ausgeführten Aufruf mit mocked=false', async () => {
    const seen: Array<{ mocked: boolean; ok: boolean }> = [];
    const hooks: ToolHooks = { afterToolCall: (e) => seen.push({ mocked: e.mocked, ok: e.ok }) };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(seen).toEqual([{ mocked: false, ok: true }]);
  });

  /**
   * Ein geblockter Aufruf hat nicht stattgefunden — dieselbe Begründung, aus der
   * er keine Karte und keinen Schritt bekommt. Ein Kosten-Hook, der ihn
   * mitzählte, lieferte falsche Zahlen.
   */
  it('ein guard-geblockter Aufruf feuert KEINEN Hook', async () => {
    const calls: string[] = [];
    const hooks: ToolHooks = {
      beforeToolCall: () => calls.push('before'),
      afterToolCall: () => calls.push('after'),
      onToolCallError: () => calls.push('error'),
    };
    const { ctx, steps } = makeCtx({ hooks });
    ctx.guards.noteFailure('search');
    ctx.guards.noteFailure('search'); // am Limit
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { error: string };
    expect(out.error).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(steps).toHaveLength(0);
  });

  it('ein werfender beforeToolCall kippt den Turn nicht — das Werkzeug läuft normal', async () => {
    const hooks: ToolHooks = {
      beforeToolCall: () => {
        throw new Error('Hook kaputt');
      },
    };
    const { ctx, steps } = makeCtx({ hooks });
    const execute = vi.fn(async () => ({ results: [1] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(execute).toHaveBeenCalledTimes(1);
    expect(out.results).toHaveLength(1);
    expect(steps).toHaveLength(1);
  });

  it('ein werfender afterToolCall kippt den Turn nicht', async () => {
    const hooks: ToolHooks = {
      afterToolCall: () => {
        throw new Error('Hook kaputt');
      },
    };
    const { ctx, steps } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [1] }) } } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(out.results).toHaveLength(1);
    expect(steps).toHaveLength(1);
  });

  it('eine abgelehnte Zusage aus afterToolCall bleibt beobachtet', async () => {
    // `afterToolCall` ist `void` typisiert, das hindert einen Handler nicht
    // daran, `async` zu sein — die Ablehnung darf keine unbeobachtete Rejection
    // werden.
    const hooks = {
      afterToolCall: () => Promise.reject(new Error('spät kaputt')),
    } as unknown as ToolHooks;
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [1] }) } } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    await new Promise((r) => setTimeout(r, 0));
    expect(out.results).toHaveLength(1);
  });

  /**
   * Ein Timeout ist der Abbruch des WARTENS, nicht des Werkzeugs — deshalb das
   * eigene Feld statt einer Formulierung, die "gestoppt" suggeriert.
   */
  it('Timeout-Pfad meldet timedOut: true', async () => {
    const seen: Array<{ error: string; timedOut: boolean }> = [];
    const hooks: ToolHooks = {
      onToolCallError: (e) => seen.push({ error: e.error, timedOut: e.timedOut }),
    };
    const { ctx } = makeCtx({ perCallTimeoutMs: 20, hooks });
    const tools = wrapToolsForLoop(
      { hang: { execute: () => new Promise(() => {}) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'hang', {});
    expect(seen).toHaveLength(1);
    expect(seen[0].timedOut).toBe(true);
    expect(seen[0].error).toMatch(/Zeitüberschreitung/);
  });

  it('ein geworfener Fehler meldet timedOut: false', async () => {
    const seen: Array<{ error: string; timedOut: boolean }> = [];
    const hooks: ToolHooks = {
      onToolCallError: (e) => seen.push({ error: e.error, timedOut: e.timedOut }),
    };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      {
        boom: {
          execute: async () => {
            throw new Error('kaputt');
          },
        },
      } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'boom', {});
    expect(seen).toEqual([{ error: 'kaputt', timedOut: false }]);
  });

  /**
   * LobeHubs Trennung, die wir übernehmen: `onToolCallError` ist der Ausnahme-
   * kanal. Ein Werkzeug, das ordentlich `{ error }` zurückgibt, hat nicht
   * geworfen — das steht als `ok: false` in `afterToolCall`.
   */
  it('ein regulär zurückgegebenes { error } feuert onToolCallError NICHT', async () => {
    const errors: unknown[] = [];
    const after: Array<{ ok: boolean }> = [];
    const hooks: ToolHooks = {
      onToolCallError: (e) => errors.push(e),
      afterToolCall: (e) => after.push({ ok: e.ok }),
    };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { flaky: { execute: async () => ({ error: 'API down' }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'flaky', {});
    expect(errors).toEqual([]);
    expect(after).toEqual([{ ok: false }]);
  });

  it('ein hängender beforeToolCall wird abgeschrieben, das Werkzeug läuft trotzdem', async () => {
    const hooks: ToolHooks = { beforeToolCall: () => new Promise<void>(() => {}) };
    const { ctx } = makeCtx({ hooks });
    const execute = vi.fn(async () => ({ results: [1] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(execute).toHaveBeenCalledTimes(1);
    expect(out.results).toHaveLength(1);
  });

  it('nur der erste mock()-Aufruf zählt', async () => {
    const hooks: ToolHooks = {
      beforeToolCall: (e) => {
        e.mock({ results: ['erste'] });
        e.mock({ results: ['zweite'] });
      },
    };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: ['echt'] }) } } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'search', {})) as { results: unknown[] };
    expect(out.results).toEqual(['erste']);
  });

  /**
   * Die Synchron-Invariante des Concurrency-Guards überlebt den Hook: Guard-
   * Kette und `noteCall` bleiben EIN synchroner Block, das Hook-Await kommt
   * erst danach. Läge es dazwischen, sähen parallele Geschwister-Aufrufe eines
   * Model-Steps gegenseitig `inFlight = 0` und das Limit (2) griffe nicht mehr,
   * sobald irgendein `beforeToolCall`-Handler konfiguriert ist — die Eval
   * prüfte dann einen Pfad, den es in Produktion nicht gibt.
   */
  it('mit beforeToolCall hält das Concurrency-Limit für parallele Aufrufe eines Steps', async () => {
    const hooks: ToolHooks = { beforeToolCall: async () => {} };
    const { ctx } = makeCtx({
      hooks,
      guards: createToolLoopGuards({ searchToolNames: new Set(['search']) }),
    });
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const results = (await Promise.all([
      run(tools, 'search', { query: 'a' }, 'call_1'),
      run(tools, 'search', { query: 'b' }, 'call_2'),
      run(tools, 'search', { query: 'c' }, 'call_3'),
    ])) as Array<{ error?: string }>;

    expect(execute).toHaveBeenCalledTimes(2);
    const deferred = results.filter((r) => r.error);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].error).toMatch(/laufen bereits/);
  });

  it('eine nach dem Hook-Timeout eintreffende Attrappe macht einen echten Lauf nicht zu mocked=true', async () => {
    // Der Handler hängt über die 500-ms-Grenze (fail-open, das Werkzeug läuft
    // echt) — und seine Attrappe landet erst WÄHREND der echten Ausführung.
    // Der Zweig-Entscheid ist da schon gefallen; `afterToolCall` muss den Lauf
    // als echt melden, sonst bucht der Kosten-Ledger ihn als Attrappe.
    let capturedMock: ((result: unknown) => void) | null = null;
    const seen: Array<{ mocked: boolean }> = [];
    const hooks: ToolHooks = {
      beforeToolCall: (e) => {
        capturedMock = e.mock;
        return new Promise<void>(() => {});
      },
      afterToolCall: (e) => seen.push({ mocked: e.mocked }),
    };
    const { ctx } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      {
        search: {
          execute: async () => {
            capturedMock?.({ results: ['zu spät'] });
            return { results: ['echt'] };
          },
        },
      } as unknown as ToolSet,
      ctx
    );

    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(out.results).toEqual(['echt']);
    expect(seen).toEqual([{ mocked: false }]);
  }, 2000);

  it('ein Fehler-Ergebnis aus einer Attrappe zählt als Fehlversuch wie ein echtes', async () => {
    const hooks: ToolHooks = { beforeToolCall: (e) => e.mock({ error: 'attrappierter Ausfall' }) };
    const { ctx, events } = makeCtx({ hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(events[1].data).toMatchObject({ ok: false });
    // Eine Attrappe, die einen Ausfall nachstellt, muss auch dessen Buchhaltung
    // nachstellen — sonst prüft die Eval einen Pfad, den es so nie gibt.
    expect(ctx.guards.checkFailureCap('search')).toBeNull(); // 1 Fehlversuch, Limit 2
  });
});

describe('composeToolHooks', () => {
  it('ruft afterToolCall beider Hooks in Reihenfolge', () => {
    const calls: string[] = [];
    const a: ToolHooks = { afterToolCall: () => calls.push('a') };
    const b: ToolHooks = { afterToolCall: () => calls.push('b') };
    composeToolHooks(a, b).afterToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      result: {},
      ok: true,
      mocked: false,
      durationMs: 1,
    });

    expect(calls).toEqual(['a', 'b']);
  });

  it('ein werfender afterToolCall hält den zweiten nicht auf', () => {
    const calls: string[] = [];
    const a: ToolHooks = {
      afterToolCall: () => {
        throw new Error('kaputt');
      },
    };
    const b: ToolHooks = { afterToolCall: () => calls.push('b') };
    composeToolHooks(a, b).afterToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      result: {},
      ok: true,
      mocked: false,
      durationMs: 1,
    });

    expect(calls).toEqual(['b']);
  });

  it('ein abgelehnter async afterToolCall hält den zweiten nicht auf', async () => {
    const calls: string[] = [];
    const a: ToolHooks = { afterToolCall: () => Promise.reject(new Error('abgelehnt')) };
    const b: ToolHooks = { afterToolCall: () => calls.push('b') };
    composeToolHooks(a, b).afterToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      result: {},
      ok: true,
      mocked: false,
      durationMs: 1,
    });

    expect(calls).toEqual(['b']);
    await new Promise((resolve) => setTimeout(resolve, 0)); // die Rejection darf niemand hochwerfen
  });

  it('ruft beforeToolCall beider Hooks in Reihenfolge, awaitet echt', async () => {
    const calls: string[] = [];
    const a: ToolHooks = {
      beforeToolCall: async () => {
        calls.push('a');
      },
    };
    const b: ToolHooks = {
      beforeToolCall: () => {
        calls.push('b');
      },
    };
    await composeToolHooks(a, b).beforeToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      mock: () => {},
    });

    expect(calls).toEqual(['a', 'b']);
  });

  it('ein werfender beforeToolCall hält den zweiten nicht auf', async () => {
    const calls: string[] = [];
    const a: ToolHooks = {
      beforeToolCall: () => {
        throw new Error('kaputt');
      },
    };
    const b: ToolHooks = {
      beforeToolCall: () => {
        calls.push('b');
      },
    };
    await composeToolHooks(a, b).beforeToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      mock: () => {},
    });

    expect(calls).toEqual(['b']);
  });

  it('ein fehlendes Hook-Mitglied auf einer Seite hindert das Mitglied der anderen Seite nicht', () => {
    const calls: string[] = [];
    const onlyAfter: ToolHooks = { afterToolCall: () => calls.push('after') };
    const onlyBefore: ToolHooks = { beforeToolCall: () => calls.push('before') };
    const composed = composeToolHooks(onlyAfter, onlyBefore);

    composed.afterToolCall?.({
      toolName: 't',
      args: {},
      stepId: 's1',
      result: {},
      ok: true,
      mocked: false,
      durationMs: 1,
    });
    void composed.beforeToolCall?.({ toolName: 't', args: {}, stepId: 's1', mock: () => {} });

    expect(calls).toEqual(['after', 'before']);
  });

  it('ohne jedes Hook-Mitglied bleibt der Vertrag leer', () => {
    expect(composeToolHooks()).toEqual({});
    expect(composeToolHooks(undefined, {})).toEqual({});
  });
});
