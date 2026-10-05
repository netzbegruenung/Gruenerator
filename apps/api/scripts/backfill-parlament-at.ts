#!/usr/bin/env npx tsx
/**
 * Erstbefüllung des Parlament-Österreich-Notebooks (`parlament_at_documents`):
 * Plenarreden, Anträge, Regierungsvorlagen und schriftliche Anfragen samt
 * Beantwortung der XXVII. und XXVIII. Gesetzgebungsperiode.
 *
 * Läuft gegen das Qdrant aus `.env` über denselben Code wie der Nacht-Sync
 * (`update-all-content.ts --source parlament-at`), der danach nur noch die
 * laufende Periode aktuell hält. Fortsetzbar ohne Stand-Datei: was schon in
 * Qdrant liegt, erkennt das Listen-Gatter und lädt es nicht neu — nach einem
 * Abbruch denselben Befehl erneut starten. Das Parlament bekommt höchstens
 * zwei Anfragen pro Sekunde; der volle Lauf dauert deshalb viele Stunden.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/backfill-parlament-at.ts --gp XXVIII --dry-run --limit 200
 *   npx tsx scripts/backfill-parlament-at.ts --gp XXVIII
 *   npx tsx scripts/backfill-parlament-at.ts --gp XXVII --kind rede --kind antrag
 *
 * Flags:
 *   --gp <code>     XXVII | XXVIII (mehrfach erlaubt; Standard beide)
 *   --kind <k>      rede | antrag | rv | anfrage (mehrfach erlaubt; Standard alle)
 *   --limit <n>     nach n geladenen Quellen je Periode und Art aufhören
 *   --dry-run       laden und zerlegen — nichts einbetten, nichts schreiben
 *   --force         auch unveränderte Quellen neu schreiben
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen die App-Importe dynamisch in `main()`.
 */
import dotenv from 'dotenv';

dotenv.config();

const GPS = ['XXVII', 'XXVIII'] as const;
const KINDS = ['rede', 'antrag', 'rv', 'anfrage'] as const;
const USD_PER_MTOK = 0.1;
const CHARS_PER_TOKEN = 3.5;

interface CliArgs {
  gps: string[];
  kinds: Array<(typeof KINDS)[number]>;
  limit?: number;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { gps: [], kinds: [], dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--gp':
        if (!GPS.includes(value as (typeof GPS)[number]))
          throw new Error(`--gp expects one of ${GPS.join(', ')}, got "${value}"`);
        args.gps.push(value);
        i++;
        break;
      case '--kind':
        if (!KINDS.includes(value as (typeof KINDS)[number]))
          throw new Error(`--kind expects one of ${KINDS.join(', ')}, got "${value}"`);
        args.kinds.push(value as (typeof KINDS)[number]);
        i++;
        break;
      case '--limit': {
        const n = Number.parseInt(value ?? '', 10);
        if (!Number.isInteger(n) || n < 1)
          throw new Error(`--limit expects a positive integer, got "${value}"`);
        args.limit = n;
        i++;
        break;
      }
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
  if (args.gps.length === 0) args.gps = [...GPS];
  if (args.kinds.length === 0) args.kinds = [...KINDS];
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { getParlamentAtScraperService } =
    await import('../services/scrapers/implementations/ParlamentAtScraper/index.js');

  const scraper = getParlamentAtScraperService();
  await scraper.init();

  const started = Date.now();
  let failed = 0;
  // Je Periode und Art ein eigener Lauf, damit --limit eine Stichprobe von
  // jeder Art liefert und nicht nur Reden.
  for (const gp of args.gps) {
    for (const kind of args.kinds) {
      const summary = await scraper.scrapeAllSources({
        gps: [gp],
        kinds: [kind],
        dryRun: args.dryRun,
        forceUpdate: args.force,
        ...(args.limit !== undefined && { limit: args.limit }),
      });
      const mtok = summary.chars / CHARS_PER_TOKEN / 1_000_000;
      console.log(
        `${gp} ${kind.padEnd(7)} stored=${summary.stored} updated=${summary.updated} skipped=${summary.skipped} ` +
          `noFulltext=${summary.noFulltext} fetchErrors=${summary.fetchErrors} errors=${summary.errors} ` +
          `units=${summary.units} chars=${summary.chars} ≈ ${(mtok * USD_PER_MTOK).toFixed(2)} $`
      );
      failed += summary.errors + summary.fetchErrors;
    }
  }
  const seconds = (Date.now() - started) / 1000;
  console.log(
    `\nduration: ${seconds.toFixed(0)} s${args.dryRun ? ' (dry run — nothing written)' : ''}`
  );
  if (failed > 0) process.exitCode = 1;
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
