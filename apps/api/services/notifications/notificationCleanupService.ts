import { createLogger } from '../../utils/logger.js';

import { deleteOldNotifications } from './NotificationService.js';

const log = createLogger('NotificationCleanup');

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const MAX_AGE_DAYS = 90;

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

async function runCleanup(): Promise<void> {
  try {
    const deleted = await deleteOldNotifications(MAX_AGE_DAYS);
    if (deleted > 0) {
      log.info(`Deleted ${deleted} notifications older than ${MAX_AGE_DAYS} days`);
    }
  } catch (err: any) {
    log.error(`Notification cleanup failed: ${err.message}`);
  }
}

export function startNotificationCleanup(): void {
  if (initialized) return;

  setTimeout(() => {
    runCleanup().catch(() => {});
  }, 60_000);

  intervalId = setInterval(() => {
    runCleanup().catch(() => {});
  }, CLEANUP_INTERVAL_MS);

  initialized = true;
  log.info('Notification cleanup started (interval: 24h)');
}

export function stopNotificationCleanup(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    initialized = false;
  }
}
