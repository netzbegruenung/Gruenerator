/**
 * One-off script: trigger a keyword snapshot refresh for one or all system
 * collections. Bypasses HTTP (calls the service directly), so no admin token needed.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-keywords.ts            # all
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-keywords.ts berlin-system
 */
import 'dotenv/config';
import {
  refreshAllKeywordSnapshots,
  refreshKeywordSnapshot,
} from '../services/notebook/notebookKeywordSnapshotService.js';

async function main() {
  const target = process.argv[2];
  if (target) {
    console.log(`Refreshing snapshot for ${target}...`);
    const result = await refreshKeywordSnapshot(target);
    console.log('Result:', JSON.stringify(result, null, 2));
  } else {
    console.log('Refreshing snapshots for all system collections (sequential)...');
    const results = await refreshAllKeywordSnapshots();
    console.log(`Done: ${results.length} succeeded`);
    console.table(results);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
