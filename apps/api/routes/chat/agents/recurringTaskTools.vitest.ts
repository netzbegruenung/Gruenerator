/**
 * `recurring_tasks` gegen ein erfundenes Repository — kein Postgres, kein
 * Runner. Alles kommt über `ctx.deps` herein, wie bei `groupTools.vitest.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeRecurringTasksTool, type RecurringTaskToolDeps } from './recurringTaskTools.js';

// `emitToolConfirmAction` legt die Karte in Redis ab; ohne erreichbares Redis
// antwortet der Client nie. Gemockt wird nur der Speicher, die Karte samt
// `CONFIRM_ACTION_CONFIG`-Eintrag bleibt echt — und der Speicher-Spy zeigt,
// welcher Body an `executeAction` ginge.
const stored = vi.hoisted(() => vi.fn<(action: unknown) => Promise<void>>(async () => {}));
vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: (action: unknown) => stored(action) },
}));

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { RecurringTask as RecurringTaskRow } from '../../../database/schema/recurringTasks.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { AgentConfig } from './types.js';
import type { RecurringTask, RecurringTaskRun } from '@gruenerator/contracts';

type ToolResult = Record<string, unknown>;

function task(over: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: 't1',
    title: 'Wochenbericht',
    instruction: 'Fasse die Woche zusammen.',
    agentIdentifier: null,
    delivery: 'document',
    emailNotify: true,
    recurrence: { frequency: 'weekly', hour: 9, minute: 0, byweekday: [0] },
    timezone: 'Europe/Berlin',
    enabled: true,
    locale: 'de-DE',
    nextRunAt: '2026-09-07T07:00:00.000Z',
    lastRunAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

function taskRun(over: Partial<RecurringTaskRun> = {}): RecurringTaskRun {
  return {
    id: 'r1',
    taskId: 't1',
    status: 'completed',
    resultsSummary: null,
    resultUrl: '/office/d1',
    error: null,
    createdAt: '2026-08-31T07:00:00.000Z',
    ...over,
  };
}

interface CtxOptions {
  userId?: string | null;
  threadId?: string | null;
  tasks?: RecurringTask[];
  /** Was `getRecurringTask` liefert — `null` = fremde oder fehlende Aufgabe. */
  found?: RecurringTask | null;
  runs?: RecurringTaskRun[];
  agent?: AgentConfig | null;
  threadAgent?: string;
  registry?: SourceRegistry;
  userText?: string;
  userLocale?: 'de-DE' | 'de-AT';
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const sseEvents: Array<[string, unknown]> = [];
  const sourceRegistry =
    opts.registry ??
    ({
      note: (title: string, content: string) => notes.push([title, content]),
      register: (results: unknown) => {
        registered.push(results);
        return '[1] Auszug';
      },
    } as unknown as SourceRegistry);
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
  } as unknown as SSEWriter;
  const state = {
    agentConfig: {
      userId: opts.userId === undefined ? 'user-1' : opts.userId,
      ...(opts.threadAgent ? { identifier: opts.threadAgent } : {}),
    },
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
    userLocale: opts.userLocale ?? 'de-DE',
  } as unknown as ChatGraphState;

  const found = opts.found === undefined ? task() : opts.found;
  const runner = vi.fn(async (_row: RecurringTaskRow) => {});
  const deps: RecurringTaskToolDeps = {
    listRecurringTasks: vi.fn(async () => opts.tasks ?? []),
    getRecurringTask: vi.fn(async () => found ?? undefined),
    getRecurringTaskRow: vi.fn(async () =>
      found ? ({ id: found.id, title: found.title } as unknown as RecurringTaskRow) : undefined
    ),
    updateRecurringTask: vi.fn(async (_u, _id, body) =>
      found ? task({ ...found, ...body, nextRunAt: '2026-09-08T07:00:00.000Z' }) : undefined
    ),
    deleteRecurringTask: vi.fn(async () => found != null),
    listRecurringTaskRuns: vi.fn(async () => opts.runs ?? []),
    runRecurringTask: runner,
    getAgentForUser: vi.fn(async () =>
      opts.agent === undefined
        ? ({ identifier: 'presse-agent', title: 'Presse-Agent' } as unknown as AgentConfig)
        : (opts.agent ?? undefined)
    ),
  };
  const tool = makeRecurringTasksTool({
    state,
    sse,
    threadId: opts.threadId === undefined ? 'thread-1' : opts.threadId,
    sourceRegistry,
    deps,
  });
  const exec = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { limit: 15, confirm: false, ...args },
      {}
    )) ?? {};
  return { run: exec, notes, registered, sseEvents, deps, runner };
}

const CREATE_ARGS = {
  action: 'create',
  title: 'Wochenbericht',
  instruction: 'Fasse die Woche zusammen.',
  recurrence: { frequency: 'weekly', hour: 9, minute: 0, byweekday: [0] },
};

describe('recurring_tasks: list', () => {
  it('refuses without a session', async () => {
    const { run } = makeCtx({ userId: null });
    expect(await run({ action: 'list' })).toMatchObject({
      error: expect.stringMatching(/Sitzung/),
    });
  });

  it('maps tasks to rows with the id as ref and a human schedule', async () => {
    const { run, registered } = makeCtx({ tasks: [task(), task({ id: 't2', enabled: false })] });
    const out = (await run({ action: 'list' })) as {
      resultCount: number;
      results: Array<{ title: string; url: string; ref?: string; snippet?: string }>;
    };
    expect(out.resultCount).toBe(2);
    expect(out.results[0]).toMatchObject({
      title: 'Wochenbericht',
      url: '/wiederkehrend',
      ref: 't1',
    });
    expect(out.results[0].snippet).toContain('wöchentlich (Montag) um 09:00 Uhr');
    expect(out.results[0].snippet).toContain('aktiv');
    expect(out.results[1].snippet).toContain('pausiert');
    expect(registered).toHaveLength(1);
  });

  it('grounds the empty case as a note, not as a source', async () => {
    const { run, notes, registered } = makeCtx({ tasks: [] });
    expect(await run({ action: 'list' })).toMatchObject({ resultCount: 0 });
    expect(notes).toHaveLength(1);
    expect(registered).toHaveLength(0);
  });
});

describe('recurring_tasks: get', () => {
  it('needs a taskId', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'get' })).toMatchObject({ error: expect.stringMatching(/taskId/) });
  });

  it('errors on a task the person does not own', async () => {
    const { run } = makeCtx({ found: null });
    expect(await run({ action: 'get', taskId: 'fremd' })).toMatchObject({
      error: expect.stringMatching(/nicht gefunden/),
    });
  });

  it('returns the detail object with labels and the last runs', async () => {
    const { run, registered } = makeCtx({
      found: task({ agentIdentifier: 'presse-agent' }),
      runs: [taskRun(), taskRun({ id: 'r2', status: 'failed', error: 'Timeout' })],
    });
    const out = (await run({ action: 'get', taskId: 't1' })) as {
      task: Record<string, unknown>;
      runs: Array<Record<string, unknown>>;
    };
    expect(out.task).toMatchObject({
      title: 'Wochenbericht',
      recurrenceLabel: 'wöchentlich (Montag) um 09:00 Uhr',
      deliveryLabel: 'als Dokument',
      agentTitle: 'Presse-Agent',
      enabled: true,
      url: '/wiederkehrend',
    });
    expect(out.runs).toHaveLength(2);
    expect(out.runs[1]).toMatchObject({ statusLabel: 'fehlgeschlagen', error: 'Timeout' });
    const block = (registered[0] as Array<{ content: string }>)[0].content;
    expect(block).toContain('Presse-Agent');
    expect(block).toContain('fehlgeschlagen (Timeout)');
  });
});

describe('recurring_tasks: create (card)', () => {
  it('needs title, instruction and recurrence', async () => {
    const { run, sseEvents } = makeCtx();
    expect(await run({ action: 'create', title: 'x' })).toMatchObject({
      error: expect.stringMatching(/title, instruction und recurrence/),
    });
    expect(sseEvents).toHaveLength(0);
  });

  it('emits the card with Takt, Zustellung and Agent rows and writes nothing', async () => {
    const { run, sseEvents, notes, deps } = makeCtx({ threadAgent: 'presse-agent' });
    const out = await run({ ...CREATE_ARGS, delivery: 'thread' });
    expect(out).toMatchObject({ ok: true, needsConfirmation: true });
    expect(sseEvents).toHaveLength(1);
    const [event, payload] = sseEvents[0] as [string, { type: string; metadata: unknown[] }];
    expect(event).toBe('confirm_action');
    expect(payload.type).toBe('create_recurring_task');
    expect(payload.metadata).toEqual([
      { key: 'Aufgabe', value: 'Wochenbericht' },
      { key: 'Takt', value: 'wöchentlich (Montag) um 09:00 Uhr' },
      { key: 'Zustellung', value: 'als neuer Chat' },
      { key: 'Agent', value: 'Presse-Agent' },
    ]);
    // Der Agent dieses Chats ist der Standard — und er wird geprüft.
    expect(deps.getAgentForUser).toHaveBeenCalledWith('presse-agent', 'user-1');
    expect(notes[0][1]).toContain('Bestätigung angefordert');
  });

  it('falls back to the default agent when the chat has none', async () => {
    const { run, sseEvents, deps } = makeCtx();
    await run(CREATE_ARGS);
    expect(deps.getAgentForUser).not.toHaveBeenCalled();
    const payload = sseEvents[0][1] as { metadata: Array<{ key: string; value: string }> };
    expect(payload.metadata.find((m) => m.key === 'Agent')?.value).toBe('Grünerator (Standard)');
  });

  it('rejects an unknown agentIdentifier instead of running it as the default', async () => {
    const { run, sseEvents } = makeCtx({ agent: null });
    expect(await run({ ...CREATE_ARGS, agentIdentifier: 'gibt-es-nicht' })).toMatchObject({
      error: expect.stringMatching(/gibt-es-nicht/),
    });
    expect(sseEvents).toHaveLength(0);
  });

  it('stores the validated contract body with locale and timezone on the card', async () => {
    stored.mockClear();
    const { run } = makeCtx({ userLocale: 'de-AT' });
    await run({ ...CREATE_ARGS, emailNotify: false });
    expect(stored).toHaveBeenCalledTimes(1);
    const pending = stored.mock.calls[0][0] as { type: string; payload: Record<string, unknown> };
    expect(pending.type).toBe('create_recurring_task');
    expect(pending.payload).toMatchObject({
      title: 'Wochenbericht',
      delivery: 'document',
      emailNotify: false,
      enabled: true,
      agentIdentifier: null,
      agentTitle: null,
      timezone: 'Europe/Vienna',
      locale: 'de-AT',
    });
  });

  it('refuses when the message rules out persistent changes', async () => {
    const { run, sseEvents } = makeCtx({
      userText: 'Nichts speichern, keine Aktion — erinnere mich jeden Montag an den Bericht',
    });
    expect(await run(CREATE_ARGS)).toMatchObject({ error: expect.stringMatching(/schließt/) });
    expect(sseEvents).toHaveLength(0);
  });

  it('refuses without a thread (no card can be confirmed)', async () => {
    const { run } = makeCtx({ threadId: null });
    expect(await run(CREATE_ARGS)).toMatchObject({ error: expect.stringMatching(/Kontext/) });
  });
});

describe('recurring_tasks: update / pause / resume', () => {
  it('update needs at least one field', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'update', taskId: 't1' })).toMatchObject({
      error: expect.stringMatching(/mindestens/),
    });
  });

  it('update passes the patch through and reports the changes', async () => {
    const { run, deps, notes } = makeCtx();
    const out = await run({
      action: 'update',
      taskId: 't1',
      recurrence: { frequency: 'daily', hour: 8, minute: 30 },
      emailNotify: false,
    });
    expect(out).toMatchObject({ ok: true });
    expect(deps.updateRecurringTask).toHaveBeenCalledWith('user-1', 't1', {
      recurrence: { frequency: 'daily', hour: 8, minute: 30 },
      emailNotify: false,
    });
    expect(notes[0][1]).toContain('läuft täglich um 08:30 Uhr');
    expect(notes[0][1]).toContain('ohne E-Mail');
  });

  it('update validates a new agent', async () => {
    const { run, deps } = makeCtx({ agent: null });
    expect(
      await run({ action: 'update', taskId: 't1', agentIdentifier: 'gibt-es-nicht' })
    ).toMatchObject({ error: expect.stringMatching(/nicht gefunden/) });
    expect(deps.updateRecurringTask).not.toHaveBeenCalled();
  });

  it('pause flips enabled off; resume flips it on', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'pause', taskId: 't1' })).toMatchObject({ ok: true });
    expect(deps.updateRecurringTask).toHaveBeenCalledWith('user-1', 't1', { enabled: false });

    const paused = makeCtx({ found: task({ enabled: false }) });
    expect(await paused.run({ action: 'resume', taskId: 't1' })).toMatchObject({ ok: true });
    expect(paused.deps.updateRecurringTask).toHaveBeenCalledWith('user-1', 't1', {
      enabled: true,
    });
  });

  it('pause on a paused task writes nothing', async () => {
    const { run, deps, notes } = makeCtx({ found: task({ enabled: false }) });
    expect(await run({ action: 'pause', taskId: 't1' })).toMatchObject({ ok: true });
    expect(deps.updateRecurringTask).not.toHaveBeenCalled();
    expect(notes[0][1]).toContain('schon pausiert');
  });

  it('owner-miss on a write is an error, not a silent no-op', async () => {
    const { run, deps } = makeCtx({ found: null });
    expect(await run({ action: 'pause', taskId: 'fremd' })).toMatchObject({
      error: expect.stringMatching(/nicht gefunden/),
    });
    expect(deps.updateRecurringTask).not.toHaveBeenCalled();
  });
});

describe('recurring_tasks: run_now', () => {
  it('fires the runner with the owner-scoped row and returns at once', async () => {
    const { run, runner, notes } = makeCtx();
    expect(await run({ action: 'run_now', taskId: 't1' })).toMatchObject({ ok: true });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toMatchObject({ id: 't1' });
    expect(notes[0][1]).toContain('gestartet');
  });

  it('refuses when the message rules out actions', async () => {
    const { run, runner } = makeCtx({ userText: 'Keine Aktion ausführen, nur erklären.' });
    expect(await run({ action: 'run_now', taskId: 't1' })).toMatchObject({
      error: expect.stringMatching(/schließt/),
    });
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('recurring_tasks: delete (two-step)', () => {
  it('asks first', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'delete', taskId: 't1' })).toMatchObject({
      needsConfirmation: true,
      note: expect.stringMatching(/confirm=true/),
    });
    expect(deps.deleteRecurringTask).not.toHaveBeenCalled();
  });

  it('deletes with confirm=true', async () => {
    const { run, deps } = makeCtx();
    expect(await run({ action: 'delete', taskId: 't1', confirm: true })).toMatchObject({
      ok: true,
      note: expect.stringMatching(/gelöscht/),
    });
    expect(deps.deleteRecurringTask).toHaveBeenCalledWith('user-1', 't1');
  });
});

/**
 * Gegen die ECHTE Registry: wo `renderAll()` den Text hinschreibt und was
 * der Schreiber im split-Modus davon sieht — er liest nur diesen Block.
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  it('puts the task list into the citable sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, tasks: [task()] });
    await run({ action: 'list' });
    expect(registry.freshSize).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Wochenbericht');
    expect(block).toContain('wöchentlich (Montag)');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('puts the task details into the sources, not into VORGÄNGE', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, runs: [taskRun()] });
    await run({ action: 'get', taskId: 't1' });
    expect(registry.freshSize).toBe(1);
    expect(registry.renderAll()).toContain('Anweisung: Fasse die Woche zusammen.');
  });

  it('reports the card request as a VORGANG, so the writer does not claim it is set up', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run(CREATE_ARGS);
    expect(registry.freshSize).toBe(0);
    const block = registry.renderAll();
    expect(block).toContain('VORGÄNGE IN DIESEM TURN');
    expect(block).toContain('Bestätigung angefordert');
  });
});
