/**
 * `toApiRun` ist die Naht, an der der Verlauf eines Hintergrundlaufs den Prozess
 * verlässt. Sie ließ zwei bereits gefüllte Spalten liegen (#3221): `verdict`
 * (seit PR #3270 geschrieben) und `duration_ms` — beide waren dadurch
 * write-only, im Vertrag nicht vorhanden und in keiner Oberfläche sichtbar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type RecurringTaskRun } from '../../database/schema/recurringTasks.js';

const statements: string[] = [];
const params: unknown[][] = [];
let result: unknown[] = [];
const fakeDb = {
  query: vi.fn(async (sql: string, p: unknown[] = []) => {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    params.push(p);
    return result;
  }),
  transaction: async <T>(fn: (client: unknown) => Promise<T>) => fn({}),
  transactionQuery: vi.fn(async (_client: unknown, sql: string) => {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    return [];
  }),
};
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => fakeDb,
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => fakeDb,
}));

const {
  claimDueRecurringTasks,
  deleteRecurringTask,
  getRecurringTaskById,
  listRecurringTasks,
  purgeRecurringTask,
  toApiRun,
} = await import('./recurringTasksRepository.js');

function row(over: Partial<RecurringTaskRun> = {}): RecurringTaskRun {
  return {
    id: 'r1',
    task_id: 't1',
    status: 'completed',
    results_summary: 'Kurzfassung',
    result_url: '/office/d1',
    error: null,
    duration_ms: 4200,
    verdict: null,
    created_at: new Date('2026-09-01T07:00:00.000Z'),
    ...over,
  };
}

describe('toApiRun', () => {
  it('reicht Dauer und Verdikt durch', () => {
    const verdict = { ok: false, hint: 'Thema verfehlt', repaired: true };
    const api = toApiRun(row({ verdict }));

    expect(api.durationMs).toBe(4200);
    expect(api.verdict).toEqual(verdict);
  });

  it('liefert null für Läufe von vor der Prüfung statt undefined', () => {
    const api = toApiRun(row({ verdict: null, duration_ms: null }));

    expect(api.verdict).toBeNull();
    expect(api.durationMs).toBeNull();
  });

  it('bildet die übrigen Felder unverändert ab', () => {
    const api = toApiRun(row({ status: 'failed', error: 'Zeitüberschreitung' }));

    expect(api).toMatchObject({
      id: 'r1',
      taskId: 't1',
      status: 'failed',
      error: 'Zeitüberschreitung',
      resultUrl: '/office/d1',
      createdAt: '2026-09-01T07:00:00.000Z',
    });
  });
});

describe('Wiederkehrende Aufgabe im Papierkorb', () => {
  const USER = '11111111-1111-4111-8111-111111111111';
  const TASK = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    statements.length = 0;
    params.length = 0;
    result = [];
  });

  it('löschen setzt nur deleted_at — kein DELETE, die Läufe bleiben', async () => {
    result = [{ id: TASK }];
    await expect(deleteRecurringTask(USER, TASK)).resolves.toBe(true);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE recurring_tasks SET deleted_at = now\(\)/);
    expect(statements[0]).toContain('user_id = $2 AND deleted_at IS NULL');
  });

  it('eine getrashte Aufgabe feuert nicht: die Fälligkeitsabfrage blendet sie aus', async () => {
    await claimDueRecurringTasks();
    expect(statements[0]).toContain('FROM recurring_tasks');
    expect(statements[0]).toContain('deleted_at IS NULL');
    expect(statements[0]).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('Liste und Worker-Lookup sehen sie nicht mehr', async () => {
    await listRecurringTasks(USER);
    await getRecurringTaskById(TASK);
    for (const sql of statements) expect(sql).toContain('deleted_at IS NULL');
  });

  it('purge löscht nur eine getrashte Zeile, bedingt auf den Stichtag', async () => {
    result = [{ id: TASK }];
    const cutoff = new Date('2026-08-30T00:00:00Z');
    await expect(purgeRecurringTask(TASK, cutoff)).resolves.toBe(true);
    expect(statements[0]).toContain('DELETE FROM recurring_tasks');
    expect(statements[0]).toContain('deleted_at IS NOT NULL');
    expect(params[0]).toEqual([TASK, cutoff]);

    result = [];
    await expect(purgeRecurringTask(TASK, null)).resolves.toBe(false);
  });
});
