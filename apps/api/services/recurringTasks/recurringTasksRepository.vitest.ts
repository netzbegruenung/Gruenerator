/**
 * `toApiRun` ist die Naht, an der der Verlauf eines Hintergrundlaufs den Prozess
 * verlässt. Sie ließ zwei bereits gefüllte Spalten liegen (#3221): `verdict`
 * (seit PR #3270 geschrieben) und `duration_ms` — beide waren dadurch
 * write-only, im Vertrag nicht vorhanden und in keiner Oberfläche sichtbar.
 */
import { describe, expect, it } from 'vitest';

import { type RecurringTaskRun } from '../../database/schema/recurringTasks.js';

import { toApiRun } from './recurringTasksRepository.js';

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
