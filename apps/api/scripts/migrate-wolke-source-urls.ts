/**
 * Gespeicherte Wolke-Punkte von `https://wolke.netzbegruenung.de/s/<token>#/<pfad>`
 * auf `wolke://<shareKey>/<pfad>` umschreiben — der Freigabe-Link ist ein
 * Zugangsschlüssel und gehört nicht in die Qdrant-Nutzlast. Standardmäßig ein
 * Trockenlauf.
 *
 * Freigaben mit Eintrag in `wolke-shares.json` heilt der Scraper selbst: vor dem
 * ETag-Gatter schreibt er eine nur unter der Altform liegende Datei um
 * (`wolkeUrlMigration.ts`, Zähler `wolke_url_migrated`). Dieses Skript bleibt
 * für das, was er nicht erreicht — Punkte entfernter Freigaben ohne Eintrag
 * (Saarland) und die Zeilen in `content_sync_articles`.
 *
 * Token → shareKey per Rückwärtssuche in `<INTERN_CONTENT_DIR>/wolke-shares.json`.
 * Ein Token ohne Eintrag (z. B. die entfernten Saarland-Freigaben, deren Punkte
 * noch liegen) braucht ein explizites `--map <token>=<key>` (wiederholbar);
 * sonst wird er nur gezählt und bleibt, wie er ist. Ausgegeben wird ein Token
 * nie ganz, nur seine ersten drei Zeichen.
 *
 * Geschrieben wird per `setPayload` auf alle Chunks derselben alten
 * `source_url`; `content_sync_articles` bekommt einen eigenen Plan aus seinen
 * eigenen Alt-URLs (der Scraper heilt nur Qdrant) und dieselbe Umbenennung. Der
 * Pfad bleibt roh (nicht URL-kodiert) — derselbe String, der heute hinter `#/`
 * steht; `resolveWolkeDisplayUrl` ist die Umkehrung. Liegt das Ziel schon
 * gespeichert vor (der Scraper lief nach dem Deploy vor dieser Migration),
 * wird in Qdrant nicht umgeschrieben, sondern als Konflikt gezählt: dann gäbe
 * es zwei Chunk-Sätze unter einer `source_url`.
 *
 * Aufruf (aus apps/api):
 *   npx tsx scripts/migrate-wolke-source-urls.ts [--map <token>=<key> …] [--write]
 *
 * dotenv muss vor jedem App-Import laufen (config/env.js liest die Umgebung
 * beim Import) — daher die dynamischen Importe.
 */
import { basename } from 'node:path';

import dotenv from 'dotenv';

interface CliArgs {
  write: boolean;
  /** token → shareKey */
  map: Record<string, string>;
}

export interface Rewrite {
  from: string;
  to: string;
  key: string;
  prefix: string;
}

export interface MigrationPlan {
  rewrites: Rewrite[];
  /** Umgeschriebene Dokumente je shareKey. */
  perKey: Record<string, number>;
  /** Umgeschriebene Dokumente je Token-Präfix. */
  perPrefix: Record<string, number>;
  /** Dokumente ohne Zuordnung je Token-Präfix — bleiben unverändert. */
  unmapped: Record<string, number>;
  /** Dokumente, deren Ziel schon gespeichert ist, je shareKey — bleiben unverändert. */
  conflicts: Record<string, number>;
}

const USAGE = 'Usage: migrate-wolke-source-urls.ts [--map <token>=<key> …] [--write]';
const COLLECTION = 'landesverbaende_documents';
const OLD_URL = /^https:\/\/wolke\.netzbegruenung\.de\/(?:index\.php\/)?s\/([A-Za-z0-9]+)#\/(.*)$/s;
const LINK_TOKEN = /^https:\/\/wolke\.netzbegruenung\.de\/(?:index\.php\/)?s\/([A-Za-z0-9]+)\/?$/;

export function parseCliArgs(argv: string[]): { args: CliArgs } | { error: string } {
  const args: CliArgs = { write: false, map: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') args.write = true;
    else if (arg === '--map') {
      const m = /^([A-Za-z0-9]+)=([^/\s]+)$/.exec(argv[++i] ?? '');
      if (!m) return { error: `--map braucht <token>=<key> (key ohne "/"). ${USAGE}` };
      args.map[m[1]] = m[2];
    } else return { error: `Unbekanntes Argument. ${USAGE}` };
  }
  return { args };
}

export function tokenPrefix(token: string): string {
  return `${token.slice(0, 3)}…`;
}

const bump = (rec: Record<string, number>, k: string): void => {
  rec[k] = (rec[k] ?? 0) + 1;
};

/**
 * `sourceUrls` sind die verschiedenen gespeicherten `source_url`s der Sammlung;
 * `shares` ist `wolke-shares.json`, `overrides` das `--map` (gewinnt).
 */
export function planWolkeMigration(
  sourceUrls: Iterable<string>,
  shares: Record<string, string>,
  overrides: Record<string, string>
): MigrationPlan {
  const tokenToKey: Record<string, string> = {};
  for (const [key, link] of Object.entries(shares)) {
    const m = LINK_TOKEN.exec(link);
    if (m) tokenToKey[m[1]] = key;
  }
  Object.assign(tokenToKey, overrides);

  const stored = new Set(sourceUrls);
  const plan: MigrationPlan = {
    rewrites: [],
    perKey: {},
    perPrefix: {},
    unmapped: {},
    conflicts: {},
  };
  for (const url of stored) {
    const m = OLD_URL.exec(url);
    if (!m) continue;
    const [, token, rel] = m;
    const prefix = tokenPrefix(token);
    const key = tokenToKey[token];
    if (!key) {
      bump(plan.unmapped, prefix);
      continue;
    }
    const to = `wolke://${key}/${rel}`;
    if (stored.has(to)) {
      bump(plan.conflicts, key);
      continue;
    }
    plan.rewrites.push({ from: url, to, key, prefix });
    bump(plan.perKey, key);
    bump(plan.perPrefix, prefix);
  }
  return plan;
}

/** Nur Zählungen, Präfixe und token-freie Ziele — nie eine alte URL. */
export function formatPlan(plan: MigrationPlan): string {
  const block = (title: string, rec: Record<string, number>): string[] => {
    const entries = Object.entries(rec).sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0
      ? [`${title}: —`]
      : [`${title}:`, ...entries.map(([k, n]) => `  ${k}  ${n}`)];
  };
  return [
    `Umzuschreiben: ${plan.rewrites.length} Dokument(e)`,
    ...block('je shareKey', plan.perKey),
    ...block('je Token-Präfix', plan.perPrefix),
    ...block('ohne Zuordnung (unverändert, --map fehlt)', plan.unmapped),
    ...block('Ziel schon gespeichert (unverändert)', plan.conflicts),
    ...plan.rewrites.slice(0, 5).map((r) => `  z. B. → ${r.to}`),
  ].join('\n');
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { args } = parsed;

  dotenv.config();
  const { env } = await import('../config/env.js');
  const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');
  const { readWolkeShares } = await import('../services/scrapers/utils/wolkeShareSecrets.js');
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  console.log(
    `[migrate-wolke-source-urls] ${args.write ? 'SCHREIBT' : 'Trockenlauf (--write zum Schreiben)'}`
  );

  const urls = new Set<string>();
  let offset: string | number | Record<string, unknown> | null | undefined;
  do {
    const res = await client.scroll(COLLECTION, {
      limit: 1000,
      with_payload: ['source_url'],
      with_vector: false,
      offset: offset ?? undefined,
    });
    for (const p of res.points) {
      const url = (p.payload ?? {}).source_url;
      if (typeof url === 'string') urls.add(url);
    }
    offset = res.next_page_offset as typeof offset;
  } while (offset !== null && offset !== undefined);

  const shares = readWolkeShares();
  const plan = planWolkeMigration(urls, shares, args.map);
  console.log(`Qdrant ${COLLECTION}:\n${formatPlan(plan)}`);

  // Eigener Plan statt der Qdrant-Umschreibungen: hat der Scraper einen Punkt
  // schon selbst geheilt, steht die Altform nur noch hier.
  const db = getPostgresInstance();
  const syncRows = await db.query<{ source_url: string }>(
    `SELECT DISTINCT source_url FROM content_sync_articles
      WHERE source_url LIKE 'https://wolke.netzbegruenung.de/%'`
  );
  const syncPlan = planWolkeMigration(
    syncRows.map((r) => r.source_url),
    shares,
    args.map
  );
  console.log(`content_sync_articles:\n${formatPlan(syncPlan)}`);

  if (args.write) {
    for (const r of plan.rewrites) {
      await client.setPayload(COLLECTION, {
        payload: { source_url: r.to },
        filter: { must: [{ key: 'source_url', match: { value: r.from } }] },
        wait: true,
      });
    }
    let rows = 0;
    for (const r of syncPlan.rewrites) {
      // (source_url, event_date) ist eindeutig: wo die neue URL am selben Tag
      // schon eine Zeile hat, ist die alte ein Duplikat und fällt weg.
      const updated = await db.query(
        `UPDATE content_sync_articles o SET source_url = $1
          WHERE o.source_url = $2
            AND NOT EXISTS (SELECT 1 FROM content_sync_articles n
                             WHERE n.source_url = $1 AND n.event_date = o.event_date)
          RETURNING o.id`,
        [r.to, r.from]
      );
      const dropped = await db.query(
        `DELETE FROM content_sync_articles WHERE source_url = $1 RETURNING id`,
        [r.from]
      );
      rows += updated.length + dropped.length;
    }
    console.log(
      `[migrate-wolke-source-urls] geschrieben: ${plan.rewrites.length} Dokument(e), ${rows} content_sync_articles-Zeile(n)`
    );
  }
  await db.close();
}

// Nur beim direkten Aufruf — die Vitest importiert die reinen Funktionen.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
}
