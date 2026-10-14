#!/usr/bin/env npx tsx
/**
 * Erstbefüllung des Notebooks Bayerischer Landtag (`landtag_bayern_documents`): Drucksachen
 * (Schriftliche Anfragen mit Antwort) und Plenarprotokolle der 19. Wahlperiode.
 *
 * Läuft lokal gegen das Qdrant aus `.env`. Fortsetzbar: nach jeder Listenseite
 * steht der Stand in `--state` (Standard `.landtag-bayern-backfill.json`). Nach
 * einem Abbruch denselben Befehl erneut starten — er holt zuerst die
 * fehlgeschlagenen Dokumente nach und macht an der nächsten Seite weiter. Was
 * schon in Qdrant liegt, wird nicht neu geladen.
 *
 * Danach hält der Nacht-Sync (`update-all-content.ts --source landtag-bayern`) den
 * Bestand aktuell.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-landtag-bayern.ts --dry-run --limit 50 --part plenarprotokoll
 *   npx tsx scripts/backfill-landtag-bayern.ts                       # alles, fortsetzbar
 *   npx tsx scripts/backfill-landtag-bayern.ts --part drucksache --concurrency 4
 *
 * Flags:
 *   --part <p>          drucksache | plenarprotokoll (mehrfach erlaubt)
 *   --concurrency <n>   Dokumente parallel auslesen/einbetten (Standard 3). Der Landtag
 *                       bekommt unabhängig davon nur eine Anfrage nach der anderen.
 *   --limit <n>         nach n verarbeiteten Dokumenten aufhören
 *   --dry-run           herunterladen, auslesen, zerlegen — nichts einbetten, nichts schreiben,
 *                       keinen Stand speichern
 *   --force             auch vorhandene Dokumente neu schreiben
 *   --state <pfad>      Datei für den Fortsetzungsstand
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

const PARTS = ['drucksache', 'plenarprotokoll'] as const;
type Part = (typeof PARTS)[number];

interface CliArgs {
  parts: Part[];
  concurrency: number;
  limit?: number;
  dryRun: boolean;
  force: boolean;
  statePath: string;
}

function positiveInt(flag: string, value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${flag} expects a positive integer, got "${value}"`);
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    parts: [],
    concurrency: 3,
    dryRun: false,
    force: false,
    statePath: '.landtag-bayern-backfill.json',
  };
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
      case '--state':
        args.statePath = argv[++i] ?? args.statePath;
        break;
      default:
        throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { getLandtagBayernScraper, ALL_LANDTAG_PARTS } =
    await import('../services/scrapers/implementations/LandtagBayernScraper/index.js');

  const scraper = getLandtagBayernScraper();
  await scraper.init();

  const started = Date.now();
  const summary = await scraper.run({
    mode: 'backfill',
    parts: args.parts.length > 0 ? args.parts : ALL_LANDTAG_PARTS,
    statePath: args.statePath,
    concurrency: args.concurrency,
    dryRun: args.dryRun,
    force: args.force,
    ...(args.limit !== undefined && { limit: args.limit }),
  });

  const seconds = (Date.now() - started) / 1000;
  console.log('\n=== Bayerischer Landtag backfill ===');
  console.log(`stored:    ${summary.stored}${args.dryRun ? ' (dry run — nothing written)' : ''}`);
  console.log(`skipped:   ${summary.skipped} (already there, repeated or empty)`);
  console.log(
    `failed:    ${summary.failed}${args.dryRun ? '' : ` — retried on the next run (${args.statePath})`}`
  );
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
