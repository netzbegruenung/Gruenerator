import { contentSyncJobStatusSchema, type ContentSyncJobStatus } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { JOB_HEARTBEAT_STALE_MS, orphanedJobView } from './contentSyncJobHeartbeat.js';

const STARTED = Date.parse('2026-11-16T15:42:03.000Z');

const running = (heartbeatAt?: number): ContentSyncJobStatus => ({
  jobId: 'job-1',
  sourceId: 'landesverbaende',
  status: 'running',
  startedAt: new Date(STARTED).toISOString(),
  ...(heartbeatAt ? { heartbeatAt: new Date(heartbeatAt).toISOString() } : {}),
});

describe('orphanedJobView', () => {
  it('leaves a job with a fresh heartbeat running', () => {
    const beat = STARTED + 20 * 60_000;
    expect(orphanedJobView(running(beat), beat + 30_000)).toBeNull();
  });

  it('reports a running job whose worker stopped heartbeating as an orphaned failure', () => {
    // #5717: API restarted ~8 min into the HE run, CI polled `running` for 55 min.
    const beat = STARTED + 8 * 60_000;
    const view = orphanedJobView(running(beat), beat + JOB_HEARTBEAT_STALE_MS + 1);

    expect(view?.status).toBe('failed');
    expect(view?.result).toMatchObject({ success: false, orphaned: true, durationMs: 8 * 60_000 });
    expect(contentSyncJobStatusSchema.parse(view)).toEqual(view);
  });

  it('falls back to startedAt for a record written before the first beat', () => {
    expect(orphanedJobView(running(), STARTED + 60_000)).toBeNull();
    expect(orphanedJobView(running(), STARTED + JOB_HEARTBEAT_STALE_MS + 1)?.status).toBe('failed');
  });

  it('never touches a finished job', () => {
    const done: ContentSyncJobStatus = { ...running(), status: 'completed' };
    expect(orphanedJobView(done, STARTED + 24 * 60 * 60_000)).toBeNull();
  });
});
