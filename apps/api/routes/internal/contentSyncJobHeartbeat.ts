import { type ContentSyncJobStatus } from '@gruenerator/contracts';

/**
 * The scrape runs inside one API worker; a restart (deploy, Salt reboot)
 * kills it without ever writing a final status, and the record would read
 * `running` until CI's poll timeout (#5717: 55 min, then a misleading 504).
 * The worker refreshes `heartbeatAt` while it runs; a poll that finds it
 * stale reports the job as orphaned instead.
 */
export const JOB_HEARTBEAT_INTERVAL_MS = 30_000;
export const JOB_HEARTBEAT_STALE_MS = 3 * 60_000;

export function orphanedJobView(
  job: ContentSyncJobStatus,
  now: number
): ContentSyncJobStatus | null {
  if (job.status !== 'running') return null;
  const lastBeat = Date.parse(job.heartbeatAt ?? job.startedAt);
  if (now - lastBeat <= JOB_HEARTBEAT_STALE_MS) return null;
  return {
    ...job,
    status: 'failed',
    result: {
      success: false,
      sourceId: job.sourceId,
      error: `Sync worker stopped heartbeating at ${new Date(lastBeat).toISOString()} (API restarted mid-run?) — job orphaned`,
      durationMs: lastBeat - Date.parse(job.startedAt),
      orphaned: true,
    },
  };
}
