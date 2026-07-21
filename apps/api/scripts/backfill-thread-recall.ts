/**
 * One-off script: embed every existing chat thread into the semantic recall
 * collection (`chat_thread_recall`). Idempotent — the point id is derived from
 * the thread id, so re-running overwrites rather than duplicates. Run once per
 * environment after deploying the recall feature.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-thread-recall.ts
 */
import 'dotenv/config';

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { upsertThreadRecallPoint } from '../services/chat/threadRecallEmbeddingService.js';

const CONCURRENCY = 8;

async function main() {
  const db = getPostgresInstance();
  const rows = (await db.query(
    `SELECT id FROM chat_threads
     WHERE COALESCE(status, 'regular') = 'regular'
     ORDER BY updated_at DESC`,
    []
  )) as Array<{ id: string }>;

  console.log(
    `Backfilling recall points for ${rows.length} threads (concurrency ${CONCURRENCY})...`
  );

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((r) =>
        upsertThreadRecallPoint(r.id)
          .then(() => {
            done++;
          })
          .catch((err) => {
            failed++;
            console.warn(`  thread ${r.id} failed: ${err}`);
          })
      )
    );
    if ((i / CONCURRENCY) % 10 === 0) {
      console.log(`  ${done + failed}/${rows.length} processed (${failed} failed)`);
    }
  }

  console.log(`Done: ${done} embedded, ${failed} failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
