#!/usr/bin/env npx tsx
/**
 * Erstbefüllung des Abgeordnetenhaus-Notebooks (`landtag_berlin_documents`):
 * Drucksachen (Schriftliche Anfragen nur mit Antwort), Plenar- und
 * Ausschussprotokolle der 19. Wahlperiode.
 *
 * Läuft lokal gegen das Qdrant aus `.env`. Fortsetzbar ohne Stand-Datei: nach
 * einem Abbruch denselben Befehl erneut starten — er listet PARDOK neu (rund
 * 250 Anfragen) und überspringt, was schon in Qdrant liegt. Fehlgeschlagene
 * Dokumente fehlen dort und kommen dabei von selbst wieder dran.
 *
 * Danach hält der Nacht-Sync (`update-all-content.ts --source landtag-berlin`)
 * den Bestand aktuell.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-landtag-berlin.ts --dry-run --limit 20 --part ausschussprotokoll
 *   npx tsx scripts/backfill-landtag-berlin.ts                       # alles
 *   npx tsx scripts/backfill-landtag-berlin.ts --part drucksache --concurrency 4
 *
 * Flags:
 *   --part <p>          drucksache | plenarprotokoll | ausschussprotokoll (mehrfach erlaubt)
 *   --concurrency <n>   Einheiten parallel auslesen/einbetten (Standard 3). Das
 *                       Abgeordnetenhaus bekommt unabhängig davon nur eine Anfrage
 *                       nach der anderen.
 *   --limit <n>         nach n gespeicherten Dokumenten aufhören
 *   --dry-run           herunterladen, auslesen, zerlegen — nichts einbetten, nichts schreiben
 *   --force             auch vorhandene Dokumente neu schreiben
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

const PARTS = ['drucksache', 'plenarprotokoll', 'ausschussprotokoll'] as const;
type Part = (typeof PARTS)[number];

interface CliArgs {
  parts: Part[];
  concurrency: number;
  limit?: number;
  dryRun: boolean;
  force: boolean;
}

function positiveInt(flag: string, value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${flag} expects a positive integer, got "${value}"`);
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { parts: [], concurrency: 3, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--part': {
        const part = argv[++i] as Part;
        if (!PARTS.includes(part))
          throw new Error(`--part expects one of ${PARTS.join(', ')}, got "${part}"`);
        args.parts.push(part);
        break;
      }
      case '--concurrency':
        args.concurrency = positiveInt(flag, argv[++i]);
        break;
      case '--limit':
        args.limit = positiveInt(flag, argv[++i]);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--force':
        args.force = true;
        break;
      default:
        throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { getLandtagBerlinScraper, ALL_LANDTAG_BERLIN_PARTS } =
    await import('../services/scrapers/implementations/LandtagBerlinScraper/index.js');

  const scraper = getLandtagBerlinScraper();
  await scraper.init();

  const started = Date.now();
  const summary = await scraper.run({
    mode: 'backfill',
    parts: args.parts.length > 0 ? args.parts : ALL_LANDTAG_BERLIN_PARTS,
    concurrency: args.concurrency,
    dryRun: args.dryRun,
    force: args.force,
    ...(args.limit !== undefined && { limit: args.limit }),
  });

  const seconds = (Date.now() - started) / 1000;
  console.log('\n=== Abgeordnetenhaus Berlin backfill ===');
  console.log(`stored:    ${summary.stored}${args.dryRun ? ' (dry run — nothing written)' : ''}`);
  console.log(`skipped:   ${summary.skipped} (already there)`);
  console.log(`excluded:  ${summary.excluded} (unanswered Anfragen, procedural TOPs, empty)`);
  console.log(`waiting:   ${summary.waiting} protocols still being indexed by PARDOK`);
  console.log(`failed:    ${summary.failed}${args.dryRun ? '' : ' — retried on the next run'}`);
  console.log(`listPages: ${summary.listPages}, chunks: ${summary.chunks}`);
  console.log(`methods:   ${JSON.stringify(summary.extractionMethods)}`);
  console.log(
    `duration:  ${seconds.toFixed(0)} s${summary.stored > 0 ? ` (${(seconds / summary.stored).toFixed(2)} s per stored document)` : ''}`
  );
  for (const error of summary.errors.slice(0, 20)) console.log(`  ! ${error}`);
  if (summary.failed > 0) process.exitCode = 1;
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
