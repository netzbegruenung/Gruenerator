/**
 * Der Recurring-Runner nach dem Umbau auf den headless Loop (#3221) — die
 * Mapping-Tabelle degraded→Pfad, die EINE Reparatur-Runde und die
 * Verdikt-Buchführung. Modell/Loop kommen über die Deps-Injektion, die
 * Delivery-/Buchführungs-Module über vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { recordRun, setEmptyCount, notify, createDoc, createThreadMock, createMessageMock } =
  vi.hoisted(() => ({
    recordRun: vi.fn(async () => {}),
    setEmptyCount: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    createDoc: vi.fn(async () => ({ id: 'doc-1' })),
    createThreadMock: vi.fn(async () => ({ id: 'thread-1' })),
    createMessageMock: vi.fn(async () => ({})),
  }));

vi.mock('./recurringTasksRepository.js', () => ({
  recordRecurringTaskRun: recordRun,
  setConsecutiveEmptyCount: setEmptyCount,
}));
vi.mock('../notifications/NotificationService.js', () => ({ createNotification: notify }));
vi.mock('../docs/DocGenerationService.js', () => ({ createDocumentWithContent: createDoc }));
vi.mock('../../routes/chat/services/threadPersistenceService.js', () => ({
  createThread: createThreadMock,
  createMessage: createMessageMock,
}));

import { runRecurringTask, type RecurringRunnerDeps } from './recurringTaskRunner.js';

import type { RecurringTask } from '../../database/schema/recurringTasks.js';
import type { HeadlessTurnResult } from '../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js';

function task(overrides: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: 't1',
    user_id: 'user-1',
    agent_identifier: null,
    title: 'Wochenbericht',
    instruction: 'Fasse die Woche zusammen.',
    delivery: 'document',
    email_notify: true,
    rrule: 'FREQ=WEEKLY',
    timezone: 'Europe/Berlin',
    enabled: true,
    locale: 'de-DE',
    config: null,
    consecutive_empty_count: 0,
    next_run_at: new Date(),
    last_run_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as RecurringTask;
}

function turn(overrides: Partial<HeadlessTurnResult> = {}): HeadlessTurnResult {
  return {
    text: '# Bericht\n\nAlles gut.',
    degraded: 'none',
    steps: [],
    citations: [],
    sources: [],
    modelName: 'mistral-medium-2604',
    ...overrides,
  };
}

function makeDeps(opts: {
  turns: HeadlessTurnResult[];
  verdicts?: Array<{ ok: boolean; hint?: string }>;
}): RecurringRunnerDeps & {
  runTurnMock: ReturnType<typeof vi.fn>;
  verifyMock: ReturnType<typeof vi.fn>;
} {
  let turnIdx = 0;
  let verdictIdx = 0;
  const runTurnMock = vi.fn(async () => opts.turns[Math.min(turnIdx++, opts.turns.length - 1)]!);
  const verifyMock = vi.fn(
    async () =>
      (opts.verdicts ?? [{ ok: true }])[
        Math.min(verdictIdx++, (opts.verdicts ?? [{ ok: true }]).length - 1)
      ]!
  );
  return {
    runTurn: runTurnMock as never,
    verify: verifyMock as never,
    runTurnMock,
    verifyMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runRecurringTask — Mapping degraded→Pfad', () => {
  it('no_answer → Empty-Pfad: Zähler hoch, kein Verify, keine Notification', async () => {
    const deps = makeDeps({ turns: [turn({ degraded: 'no_answer', text: '' })] });
    await runRecurringTask(task(), deps);

    expect(setEmptyCount).toHaveBeenCalledWith('t1', 1);
    expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'empty' }));
    expect(deps.verifyMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(createDoc).not.toHaveBeenCalled();
  });

  it('failed/aborted → Failed-Pfad: kein Ersatztext als Dokument, Failure-Notification', async () => {
    const deps = makeDeps({
      turns: [turn({ degraded: 'aborted', text: 'Die Antwort wurde abgebrochen…' })],
    });
    await runRecurringTask(task(), deps);

    expect(createDoc).not.toHaveBeenCalled();
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('aborted') })
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_task_failed' }));
  });

  it('none → verifizieren, liefern, Verdikt im Run-Protokoll', async () => {
    const deps = makeDeps({ turns: [turn()], verdicts: [{ ok: true }] });
    await runRecurringTask(task(), deps);

    expect(deps.verifyMock).toHaveBeenCalledTimes(1);
    expect(createDoc).toHaveBeenCalledTimes(1);
    expect(setEmptyCount).toHaveBeenCalledWith('t1', 0);
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', verdict: { ok: true } })
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_task_completed' }));
  });
});

describe('runRecurringTask — die EINE Reparatur-Runde', () => {
  it('beanstandet + Hinweis → genau ein zweiter Lauf mit feedback, Zweitverdikt zählt', async () => {
    const deps = makeDeps({
      turns: [turn({ text: 'Erster Entwurf' }), turn({ text: 'Besserer Entwurf' })],
      verdicts: [{ ok: false, hint: 'Thema verfehlt' }, { ok: true }],
    });
    await runRecurringTask(task(), deps);

    expect(deps.runTurnMock).toHaveBeenCalledTimes(2);
    const secondCall = deps.runTurnMock.mock.calls[1]![0] as Record<string, unknown>;
    expect(secondCall.feedback).toEqual({ hint: 'Thema verfehlt', priorDraft: 'Erster Entwurf' });
    expect(deps.verifyMock).toHaveBeenCalledTimes(2);
    // Geliefert wird der reparierte Entwurf.
    expect(createDoc).toHaveBeenCalledWith(
      expect.any(String),
      'Besserer Entwurf',
      'blank',
      'user-1'
    );
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: { ok: true, repaired: true } })
    );
  });

  it('degradierte Reparatur → Erstentwurf wird geliefert, repaired: false', async () => {
    const deps = makeDeps({
      turns: [turn({ text: 'Erster Entwurf' }), turn({ degraded: 'failed', text: '' })],
      verdicts: [{ ok: false, hint: 'zu knapp' }],
    });
    await runRecurringTask(task(), deps);

    expect(createDoc).toHaveBeenCalledWith(expect.any(String), 'Erster Entwurf', 'blank', 'user-1');
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        verdict: { ok: false, hint: 'zu knapp', repaired: false },
      })
    );
  });

  it('beanstandet OHNE Hinweis → keine Reparatur, trotzdem geliefert', async () => {
    const deps = makeDeps({ turns: [turn()], verdicts: [{ ok: false }] });
    await runRecurringTask(task(), deps);

    expect(deps.runTurnMock).toHaveBeenCalledTimes(1);
    expect(createDoc).toHaveBeenCalledTimes(1);
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', verdict: { ok: false } })
    );
  });
});

describe('runRecurringTask — Delivery unverändert', () => {
  it('thread-Delivery legt Thread + zwei Nachrichten an', async () => {
    const deps = makeDeps({ turns: [turn()] });
    await runRecurringTask(task({ delivery: 'thread' }), deps);

    expect(createThreadMock).toHaveBeenCalledWith(
      'user-1',
      'gruenerator-universal',
      'Wochenbericht',
      'chat'
    );
    expect(createMessageMock).toHaveBeenCalledTimes(2);
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', resultUrl: '/chat/thread-1' })
    );
  });

  it('gebundener Agent reicht restrictToAgentTools durch', async () => {
    const deps = makeDeps({ turns: [turn()] });
    await runRecurringTask(task({ agent_identifier: 'mein-agent' }), deps);

    const call = deps.runTurnMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.agentId).toBe('mein-agent');
    expect(call.restrictToAgentTools).toBe(true);
  });
});
