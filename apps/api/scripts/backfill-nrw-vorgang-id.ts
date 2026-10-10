#!/usr/bin/env npx tsx
/**
 * Schreibt `vorgang_id` (Präfix der `record_id`) auf alle Chunks der
 * NRW-Dokumente, die vor dem Feld eingelesen wurden — aus der gespeicherten
 * Payload, ohne Download und ohne neue Einbettung (#4307). Wiederholbar.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-nrw-vorgang-id.ts --dry-run
 *   npx tsx scripts/backfill-nrw-vorgang-id.ts
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
  const { runPool } = await import('../services/scrapers/parliament/index.js');
  const { LANDTAG_NRW_COLLECTION, vorgangIdOf } =
    await import('../services/scrapers/implementations/LandtagNrwScraper/builders.js');

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;

  let documents = 0;
  let offset: string | number | null | undefined;
  do {
    const page = await client.scroll(LANDTAG_NRW_COLLECTION, {
      filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
      with_payload: ['document_id', 'record_id'],
      with_vector: false,
      limit: 200,
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    await runPool(page.points, 8, async (point) => {
      const { document_id: documentId, record_id: recordId } = point.payload ?? {};
      if (typeof documentId !== 'string' || typeof recordId !== 'string') return;
      documents += 1;
      if (dryRun) return;
      await client.setPayload(LANDTAG_NRW_COLLECTION, {
        payload: { vorgang_id: vorgangIdOf(recordId) },
        filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
        wait: true,
      });
    });
    offset = page.next_page_offset as string | number | null | undefined;
    console.log(`${documents} documents`);
  } while (offset !== undefined && offset !== null);

  console.log(`\n=== ${LANDTAG_NRW_COLLECTION}${dryRun ? ' (dry run — nothing written)' : ''} ===`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
