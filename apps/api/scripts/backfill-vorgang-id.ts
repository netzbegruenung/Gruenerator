#!/usr/bin/env npx tsx
/**
 * Schreibt `vorgang_id` auf alle Chunks der Landtags-Dokumente, die vor dem
 * Feld eingelesen wurden — aus der gespeicherten Payload, ohne Download und ohne
 * neue Einbettung (#4307). Wiederholbar. NRW: Präfix der `record_id`; Berlin:
 * Nummer der Vorlage hinter einem Änderungsantrags-Suffix, nur Drucksachen.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-vorgang-id.ts --dry-run
 *   npx tsx scripts/backfill-vorgang-id.ts --landtag berlin
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

const LANDTAGE = ['nrw', 'berlin'] as const;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const flag = argv.indexOf('--landtag');
  const landtage = flag === -1 ? [...LANDTAGE] : [argv[flag + 1] as (typeof LANDTAGE)[number]];
  if (!landtage.every((l) => LANDTAGE.includes(l)))
    throw new Error('--landtag expects nrw or berlin');

  const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
  const { runPool } = await import('../services/scrapers/parliament/index.js');
  const nrw = await import('../services/scrapers/implementations/LandtagNrwScraper/builders.js');
  const berlin =
    await import('../services/scrapers/implementations/LandtagBerlinScraper/builders.js');

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;

  for (const landtag of landtage) {
    const collection =
      landtag === 'nrw' ? nrw.LANDTAG_NRW_COLLECTION : berlin.LANDTAG_BERLIN_COLLECTION;
    const sourceField = landtag === 'nrw' ? 'record_id' : 'document_number';
    const vorgangIdOf = landtag === 'nrw' ? nrw.vorgangIdOf : berlin.vorgangIdOf;
    const filter = {
      must: [
        { key: 'chunk_index', match: { value: 0 } },
        ...(landtag === 'berlin' ? [{ key: 'content_type', match: { value: 'drucksache' } }] : []),
      ],
    };

    let documents = 0;
    let offset: string | number | null | undefined;
    do {
      const page = await client.scroll(collection, {
        filter,
        with_payload: ['document_id', sourceField],
        with_vector: false,
        limit: 200,
        ...(offset !== undefined && offset !== null ? { offset } : {}),
      });
      await runPool(page.points, 8, async (point) => {
        const { document_id: documentId, [sourceField]: source } = point.payload ?? {};
        if (typeof documentId !== 'string' || typeof source !== 'string') return;
        documents += 1;
        if (dryRun) return;
        await client.setPayload(collection, {
          payload: { vorgang_id: vorgangIdOf(source) },
          filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
          wait: true,
        });
      });
      offset = page.next_page_offset as string | number | null | undefined;
      console.log(`[${landtag}] ${documents} documents`);
    } while (offset !== undefined && offset !== null);

    console.log(`\n=== ${collection}${dryRun ? ' (dry run — nothing written)' : ''} ===`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
