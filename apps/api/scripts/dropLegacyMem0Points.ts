/**
 * One-off: remove the points mem0ai left in the `user_memories` collection.
 *
 * The explicit-memory rebuild (2026-09-01) reuses the collection and writes a
 * `kind` payload on every point; the retrieval filter requires it, so the old
 * points are already invisible. They only cost disk and confuse anyone who
 * inspects the collection. Run once per environment after the API with the new
 * schema has booted (the boot creates the `kind` index):
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/dropLegacyMem0Points.ts
 */
import { getQdrantInstance } from '../database/services/QdrantService/index.js';
import { USER_MEMORIES_COLLECTION } from '../services/memory/index.js';

async function main(): Promise<void> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;
  const before = await client.count(USER_MEMORIES_COLLECTION, { exact: true });
  await client.delete(USER_MEMORIES_COLLECTION, {
    wait: true,
    filter: { must: [{ is_empty: { key: 'kind' } }] },
  });
  const after = await client.count(USER_MEMORIES_COLLECTION, { exact: true });
  console.log(
    `user_memories: ${before.count} → ${after.count} points (removed ${before.count - after.count} legacy mem0 points)`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
