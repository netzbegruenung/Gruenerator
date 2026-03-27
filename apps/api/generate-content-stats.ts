/**
 * Generate Content Stats
 *
 * Queries Qdrant for document counts per collection and per Landesverband,
 * then generates a markdown page for the Docusaurus documentation site.
 *
 * Usage: npx tsx apps/api/generate-content-stats.ts
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY, QDRANT_BASIC_AUTH_USERNAME, QDRANT_BASIC_AUTH_PASSWORD
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const QDRANT_URL = (process.env.QDRANT_URL || '').replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const BASIC_USER = process.env.QDRANT_BASIC_AUTH_USERNAME;
const BASIC_PASS = process.env.QDRANT_BASIC_AUTH_PASSWORD;

const CONTENT_COLLECTIONS = [
  { name: 'grundsatz_documents', label: 'Grundsatzprogramm' },
  { name: 'bundestag_content', label: 'Bundestag' },
  { name: 'landesverbaende_documents', label: 'Landesverbände' },
  { name: 'gruene_de_documents', label: 'gruene.de' },
  { name: 'gruenblog_documents', label: 'Grünblog' },
  { name: 'oesterreich_gruene_documents', label: 'Grüne Österreich' },
  { name: 'gruene_at_documents', label: 'gruene.at' },
  { name: 'kommunalwiki_documents', label: 'KommunalWiki' },
  { name: 'boell_stiftung_documents', label: 'Böll-Stiftung' },
  { name: 'satzungen_documents', label: 'Satzungen' },
  { name: 'social_media_examples', label: 'Social-Media-Beispiele' },
  { name: 'hamburg_documents', label: 'Hamburg (alt)' },
];

const LV_SHORT_NAMES: { code: string; label: string }[] = [
  { code: 'LSA', label: 'Sachsen-Anhalt' },
  { code: 'LSA-F', label: 'Sachsen-Anhalt Fraktion' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'MV-F', label: 'Mecklenburg-Vorpommern Fraktion' },
  { code: 'HH', label: 'Hamburg' },
  { code: 'BE', label: 'Berlin' },
  { code: 'TH', label: 'Thüringen' },
  { code: 'TH-F', label: 'Thüringen Fraktion' },
];

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': QDRANT_API_KEY,
  };
  if (BASIC_USER && BASIC_PASS) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64')}`;
  }
  return headers;
}

async function getCollectionCount(collection: string): Promise<number | null> {
  try {
    const resp = await fetch(`${QDRANT_URL}/collections/${collection}/points/count`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.result?.count ?? null;
  } catch {
    return null;
  }
}

async function getLvCount(code: string): Promise<number | null> {
  try {
    const resp = await fetch(`${QDRANT_URL}/collections/landesverbaende_documents/points/count`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        filter: { must: [{ key: 'landesverband', match: { value: code } }] },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.result?.count ?? null;
  } catch {
    return null;
  }
}

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('de-DE');
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('QDRANT_URL and QDRANT_API_KEY are required');
    process.exit(1);
  }

  console.log('Querying Qdrant for content statistics...');

  // Fetch all collection counts in parallel
  const collectionResults = await Promise.all(
    CONTENT_COLLECTIONS.map(async (c) => ({
      ...c,
      count: await getCollectionCount(c.name),
    }))
  );

  // Fetch all LV counts in parallel
  const lvResults = await Promise.all(
    LV_SHORT_NAMES.map(async (lv) => ({
      ...lv,
      count: await getLvCount(lv.code),
    }))
  );

  const totalPoints = collectionResults.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const lvTotal = lvResults.reduce((sum, lv) => sum + (lv.count ?? 0), 0);
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });

  // Generate markdown
  const collectionRows = collectionResults
    .filter((c) => c.count !== null && c.count > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map((c) => `| ${c.label} | ${formatNumber(c.count)} |`)
    .join('\n');

  const lvRows = lvResults
    .filter((lv) => lv.count !== null && lv.count > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map((lv) => `| ${lv.label} | ${lv.code} | ${formatNumber(lv.count)} |`)
    .join('\n');

  const markdown = `---
sidebar_position: 99
title: Inhaltsdatenbank
description: Aktuelle Statistiken über die indexierten Inhalte im Grünerator
---

# Inhaltsdatenbank

> Zuletzt aktualisiert: **${now}**

## Übersicht

Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei.
Insgesamt sind **${formatNumber(totalPoints)} Vektoren** in der Datenbank gespeichert.

## Sammlungen

| Sammlung | Vektoren |
|----------|-------:|
${collectionRows}
| **Gesamt** | **${formatNumber(totalPoints)}** |

## Landesverbände

Die Landesverbände-Sammlung enthält **${formatNumber(lvTotal)} Vektoren** aus ${lvResults.filter((lv) => (lv.count ?? 0) > 0).length} Quellen.

| Landesverband | Kürzel | Vektoren |
|---------------|--------|-------:|
${lvRows}
| **Gesamt** | | **${formatNumber(lvTotal)}** |

## Aktualisierung

- **Landesverbände**: Stündlich zwischen 06:00 und 22:00 Uhr
- **Alle anderen Quellen**: Täglich um 03:00 Uhr

Die Synchronisation läuft automatisch über GitHub Actions.
Neue Inhalte werden erkannt, in Textabschnitte aufgeteilt und als Vektoren (Embeddings) gespeichert.
`;

  const outputPath =
    process.env.STATS_OUTPUT_PATH ||
    path.join(
      process.cwd(),
      'documentation',
      'docs',
      'ueber-den-gruenerator',
      'inhaltsdatenbank.md'
    );

  writeFileSync(outputPath, markdown);
  console.log(`Stats page written to ${outputPath}`);
  console.log(
    `Total: ${formatNumber(totalPoints)} vectors across ${collectionResults.filter((c) => (c.count ?? 0) > 0).length} collections`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
