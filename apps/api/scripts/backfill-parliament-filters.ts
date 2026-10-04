#!/usr/bin/env npx tsx
/**
 * Rechnet die Filterfelder Redner*in, Fraktion (Redebeitrag), Ergebnis und
 * Bezirk/Kreis für Dokumente nach, die vor diesen Feldern geschrieben wurden —
 * aus der gespeicherten Payload, ohne Download und ohne neue Einbettung. Die
 * Felder kommen aus denselben Funktionen wie beim Einlesen
 * (`filterFieldsOf` je Landtag) und gehen per setPayload auf alle Chunks.
 *
 * Wiederholbar: ein zweiter Lauf schreibt dieselben Werte. Beim Landtag NRW
 * stehen die Rednerzeilen der Datenbank danach roh in `redner`, `speakers`
 * trägt die Namen; der Lauf liest `redner`, wo es schon da ist.
 *
 * Text: `full_text` von Chunk 0, sonst die Chunks aneinander (bei Dokumenten
 * über 400.000 Zeichen). Der Chunk-Text ist plattgedrückt — Redner*innen
 * findet die zeilenweise Suche dort nicht; Ergebnis und Bezirk schon.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-parliament-filters.ts --dry-run
 *   npx tsx scripts/backfill-parliament-filters.ts --landtag berlin
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

const LANDTAGE = ['nrw', 'berlin'] as const;
type Landtag = (typeof LANDTAGE)[number];

interface CliArgs {
  landtage: Landtag[];
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { landtage: [], dryRun: false, concurrency: 8 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--landtag') {
      const value = argv[++i] as Landtag;
      if (!LANDTAGE.includes(value)) throw new Error(`--landtag expects nrw or berlin`);
      args.landtage.push(value);
    } else if (flag === '--concurrency') args.concurrency = Number.parseInt(argv[++i] ?? '', 10);
    else throw new Error(`unknown flag ${flag}`);
  }
  if (args.landtage.length === 0) args.landtage = [...LANDTAGE];
  return args;
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
  const { runPool } = await import('../services/scrapers/parliament/index.js');
  const nrw = await import('../services/scrapers/implementations/LandtagNrwScraper/builders.js');
  const berlin =
    await import('../services/scrapers/implementations/LandtagBerlinScraper/builders.js');

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;

  for (const landtag of args.landtage) {
    const collection =
      landtag === 'nrw' ? nrw.LANDTAG_NRW_COLLECTION : berlin.LANDTAG_BERLIN_COLLECTION;

    const textOf = async (documentId: string, fullText: unknown): Promise<string> => {
      if (typeof fullText === 'string') return fullText;
      const chunks: { index: number; text: string }[] = [];
      let offset: string | number | null | undefined;
      do {
        const page = await client.scroll(collection, {
          filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
          with_payload: ['chunk_index', 'chunk_text'],
          with_vector: false,
          limit: 256,
          ...(offset !== undefined && offset !== null ? { offset } : {}),
        });
        for (const p of page.points) {
          chunks.push({
            index: Number(p.payload?.chunk_index),
            text: String(p.payload?.chunk_text),
          });
        }
        offset = page.next_page_offset as string | number | null | undefined;
      } while (offset !== undefined && offset !== null);
      return chunks
        .sort((a, b) => a.index - b.index)
        .map((c) => c.text)
        .join('\n');
    };

    const counts: Record<string, number> = { documents: 0 };
    let offset: string | number | null | undefined;
    do {
      const page = await client.scroll(collection, {
        filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
        with_payload: [
          'document_id',
          'title',
          'content_type',
          'speakers',
          'redner',
          'beschluss',
          'party',
          'full_text',
        ],
        with_vector: false,
        limit: 200,
        ...(offset !== undefined && offset !== null ? { offset } : {}),
      });
      await runPool(page.points, args.concurrency, async (point) => {
        const p = point.payload ?? {};
        const documentId = String(p.document_id);
        const title = String(p.title ?? '');
        const text = await textOf(documentId, p.full_text);
        let fields: Record<string, unknown>;
        if (landtag === 'nrw') {
          // Vor dem ersten Lauf stehen die Rednerzeilen roh in `speakers`.
          const redner = p.redner !== undefined ? asStrings(p.redner) : asStrings(p.speakers);
          fields = {
            redner,
            ...nrw.filterFieldsOf({
              redner,
              beschluss: typeof p.beschluss === 'string' ? p.beschluss : null,
              title,
              part: p.content_type as Parameters<typeof nrw.filterFieldsOf>[0]['part'],
              text,
            }),
          };
        } else {
          const part = p.content_type as Parameters<typeof berlin.filterFieldsOf>[0]['part'];
          fields = berlin.filterFieldsOf({
            part,
            title,
            text,
            urheber: asStrings(p.speakers),
            parties: part === 'drucksache' ? [] : asStrings(p.party),
          });
        }
        counts.documents += 1;
        for (const [key, value] of Object.entries(fields)) {
          if (Array.isArray(value) && value.length > 0) counts[key] = (counts[key] ?? 0) + 1;
        }
        if (args.dryRun) return;
        await client.setPayload(collection, {
          payload: fields,
          filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
          wait: true,
        });
      });
      offset = page.next_page_offset as string | number | null | undefined;
      console.log(`[${landtag}] ${counts.documents} documents`);
    } while (offset !== undefined && offset !== null);

    console.log(
      `\n=== ${collection}${args.dryRun ? ' (dry run — nothing written)' : ''} ===\n${JSON.stringify(counts, null, 2)}`
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Offene Qdrant-/Redis-Verbindungen halten den Prozess sonst am Leben.
    process.exit(process.exitCode ?? 0);
  });
