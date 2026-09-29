/**
 * Removes Papierkorb items once their retention has run out.
 *
 * Every tick walks all kinds in `TRASH_KINDS`, asks each for up to
 * `PER_KIND_BATCH` items trashed before the cutoff, and purges them one by one.
 * The rest waits for the next tick. The cutoff is handed to `purge` as well: an
 * item restored between listing and purging no longer matches the conditional
 * delete, and `purge` reports that as `false` rather than removing a live row.
 *
 * Reports, does not delete. The scheduled run calls this with `apply` at its
 * default of false: it lists what it would purge and writes it down. Switching
 * it on is one word below — a code change someone signs off on after a deploy
 * with clean logs, not a setting that can stand differently on one host.
 */
import { type TrashKind } from '@gruenerator/contracts';

import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';

import { TRASH_KINDS, TRASH_RETENTION_DAYS } from './trashRegistry.js';

const log = createLogger('TrashPurge');

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 10 * 60 * 1000;
/** Per kind and tick; the rest is picked up by the next tick. */
export const PER_KIND_BATCH = 200;
/** Probelauf. Turning it on is a one-word code change, never an env switch. */
const APPLY = false;

export interface KindPurgeReport {
  kind: TrashKind;
  found: number;
  purged: number;
  failed: number;
}

export async function purgeExpiredTrash(apply = APPLY): Promise<KindPurgeReport[]> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);
  const report: KindPurgeReport[] = [];

  // Object.keys widens to string; the registry is `satisfies Record<TrashKind, …>`.
  for (const kind of Object.keys(TRASH_KINDS) as TrashKind[]) {
    const handler = TRASH_KINDS[kind];
    const entry: KindPurgeReport = { kind, found: 0, purged: 0, failed: 0 };
    report.push(entry);

    let expired: Array<{ id: string }>;
    try {
      expired = await handler.listExpired(cutoff, PER_KIND_BATCH);
    } catch (err: unknown) {
      entry.failed++;
      reportBackgroundError(err, { job: 'trash-purge', kind });
      continue;
    }
    entry.found = expired.length;
    if (!apply) continue;

    for (const { id } of expired) {
      try {
        if (await handler.purge(id, cutoff)) entry.purged++;
      } catch (err: unknown) {
        entry.failed++;
        reportBackgroundError(err, { job: 'trash-purge', kind, id });
      }
    }
  }

  log.info(
    `[${apply ? 'ANGEWENDET' : 'PROBELAUF'}] Stichtag ${cutoff.toISOString()} — ` +
      'je Art gefunden/bereinigt/fehlgeschlagen: ' +
      report.map((r) => `${r.kind} ${r.found}/${r.purged}/${r.failed}`).join(', ')
  );
  return report;
}

const worker = createIntervalWorker({
  name: 'TrashPurge',
  intervalMs: INTERVAL_MS,
  initialDelayMs: INITIAL_DELAY_MS,
  tick: async () => {
    await purgeExpiredTrash();
  },
});

export function startTrashPurge(): void {
  worker.start();
}
