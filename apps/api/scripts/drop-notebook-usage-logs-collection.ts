/**
 * One-off: drop the `notebook_usage_logs` Qdrant collection.
 *
 * #3127/#3136 removed every writer and reader in the codebase; #3137 records
 * the repo owner's confirmation (2026-09-02) that no external process reads
 * it either. Prints the collection's points_count before deleting so the
 * count is on record, and refuses to delete without --yes.
 *
 * Usage:
 *   pnpm --filter @gruenerator/api qdrant:drop-usage-logs -- --yes
 */
import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');

const COLLECTION = 'notebook_usage_logs';

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  // A missing collection is the one benign outcome; every other failure
  // (auth, network, Qdrant down) must surface instead of reading as "dropped".
  const { exists } = await client.collectionExists(COLLECTION);
  if (!exists) {
    console.log(`[${COLLECTION}] not found — nothing to drop`);
    return;
  }

  const info = await client.getCollection(COLLECTION);
  console.log(`[${COLLECTION}] points_count: ${info.points_count ?? 'unknown'}`);

  if (!confirmed) {
    console.log('Refusing to delete without --yes. Re-run with --yes to actually drop it.');
    return;
  }

  await client.deleteCollection(COLLECTION);
  console.log(`[${COLLECTION}] dropped.`);
}

await main();
