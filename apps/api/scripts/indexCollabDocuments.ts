#!/usr/bin/env npx tsx
/**
 * Index the collaborative documents that are shared into a project (Docs,
 * Präsentationen, Canvas, Tabellen, Boards) into Qdrant, ahead of the
 * background worker (`services/docs/collabSearchIndex.ts`).
 *
 * Scope: only documents shared into a live project — every indexed document
 * costs embedding calls, and only project chats search them. Idempotent: the
 * content hash skips documents that are already current, so a re-run costs
 * reads, not embeddings. The worker does the same work one pass of 10 per
 * minute; use this for a large first backfill.
 *
 * Usage:
 *   npx tsx scripts/indexCollabDocuments.ts [--dry-run] [--limit=500]
 */
import dotenv from 'dotenv';

dotenv.config();

import { getPostgresInstance } from '../database/services/PostgresService/PostgresService.js';
import {
  findDueCollabDocuments,
  indexCollabDocument,
  type CollabIndexResult,
} from '../services/docs/collabSearchIndex.js';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : 500;

async function main(): Promise<void> {
  await getPostgresInstance().ensureInitialized();
  // quietMinutes 0: a backfill is not waiting for anyone to stop typing.
  const ids = await findDueCollabDocuments(0, limit);
  console.log(`${ids.length} document(s) due${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) return;

  const counts: Record<CollabIndexResult, number> = {
    indexed: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
  };
  let failed = 0;
  for (const id of ids) {
    try {
      counts[await indexCollabDocument(id)]++;
    } catch (err) {
      failed++;
      console.error(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log({ ...counts, failed });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
