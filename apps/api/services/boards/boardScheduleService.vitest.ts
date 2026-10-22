/**
 * Whose identity a scheduled or redone KI-Spalte run carries. A run reads its
 * sources and writes its outputs as `requested_by`, so it must always be the
 * person who set the flow or pressed the button — never someone else on the
 * board.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardScheduleUpdate } from '@gruenerator/contracts';

const { query, enqueueAgentTask } = vi.hoisted(() => ({
  query: vi.fn(),
  enqueueAgentTask: vi.fn(),
}));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query,
    transaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
    transactionQuery: (_client: unknown, sql: string, params: unknown[]) => query(sql, params),
  }),
}));
vi.mock('./agentTaskService.js', () => ({
  enqueueAgentTask,
  flowTaskText: () => 'Aufgabe',
}));

const { updateSchedule, enqueueScheduleRun, redoRun, claimAndEnqueueDueSchedules } =
  await import('./boardScheduleService.js');

const FLOW = {
  source: { type: 'none' },
  task: { type: 'freeform', prompt: 'Fasse zusammen' },
};
const CARD_CONTEXT = { title: 'Karte', description: 'Beschreibung' };

const scheduleRow = {
  id: 's1',
  board_id: 'b1',
  card_id: 'k1',
  created_by: 'creator',
  locale: 'de-DE',
  flow_config: { ...FLOW, cardContext: CARD_CONTEXT },
  rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
  timezone: 'Europe/Berlin',
  require_review: false,
  enabled: true,
  next_run_at: new Date('2026-10-23T06:00:00Z'),
  last_run_at: null,
  created_at: new Date('2026-10-01T06:00:00Z'),
  updated_at: new Date('2026-10-01T06:00:00Z'),
};

function taskRow(status: string) {
  return {
    id: 'task1',
    board_id: 'b1',
    card_id: 'k1',
    requested_by: 'creator',
    locale: 'de-DE',
    status,
    schedule_id: 's1',
    require_review: true,
    flow_config: { ...FLOW, cardContext: CARD_CONTEXT },
  };
}

const updateParams = (): unknown[] =>
  (query.mock.calls.find((c) => String(c[0]).includes('UPDATE board_scheduled_runs')) ??
    [])[1] as unknown[];

beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('UPDATE board_scheduled_runs') && sql.includes('RETURNING')) {
      return [scheduleRow];
    }
    if (sql.includes('FROM board_scheduled_runs')) return [scheduleRow];
    return [];
  });
  enqueueAgentTask.mockReset().mockResolvedValue({ id: 'new-task' });
});

describe('updateSchedule', () => {
  it('re-owns the schedule to whoever replaces its flow', async () => {
    const patch = { flow: FLOW, cardContext: CARD_CONTEXT } as unknown as BoardScheduleUpdate;

    await updateSchedule('b1', 's1', patch, 'editor');

    expect(updateParams()?.[8]).toBe('editor');
  });

  it('keeps the owner when only timing or the switch changes', async () => {
    await updateSchedule('b1', 's1', { enabled: false } as BoardScheduleUpdate, 'editor');

    expect(updateParams()?.[8]).toBe('creator');
  });
});

describe('running a schedule', () => {
  it('"run now" runs as the person who pressed it', async () => {
    await enqueueScheduleRun('b1', 's1', 'editor');

    expect(enqueueAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'editor' })
    );
  });

  it('the poller runs as the schedule owner', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FOR UPDATE OF s SKIP LOCKED') ? [scheduleRow] : []
    );

    await claimAndEnqueueDueSchedules();

    expect(enqueueAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'creator' })
    );
  });
});

describe('redoRun', () => {
  /** agent_tasks as the database would answer the SELECT. */
  function withTask(status: string) {
    query.mockImplementation(async (sql: string) => {
      if (!sql.includes('SELECT * FROM agent_tasks')) return [];
      const row = taskRow(status);
      return sql.includes("status = 'awaiting_review'") && status !== 'awaiting_review'
        ? []
        : [row];
    });
  }

  it('runs the redo as the person who asked for it', async () => {
    withTask('awaiting_review');

    const id = await redoRun('b1', 'task1', 'editor', 'Kürzer bitte');

    expect(id).toBe('new-task');
    expect(enqueueAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'editor' })
    );
  });

  it('refuses a run that is not awaiting review', async () => {
    for (const status of ['completed', 'failed', 'pending', 'running']) {
      withTask(status);

      expect(await redoRun('b1', 'task1', 'editor')).toBeNull();
    }
    expect(enqueueAgentTask).not.toHaveBeenCalled();
  });
});
