/**
 * Queries Qdrant for document counts per collection and per Landesverband,
 * then renders the markdown page for the Docusaurus documentation site.
 *
 * Shared by the CLI entrypoint (generate-content-stats.ts, for local/manual
 * runs) and the internal API endpoint (GET /api/internal/content-sync/stats,
 * for CI — which has no direct Qdrant network access).
 */
import { env } from '../../config/env.js';

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
  { name: 'abgeordnetenwatch_documents', label: 'Abgeordnetenwatch' },
  { name: 'social_media_examples', label: 'Social-Media-Beispiele' },
  { name: 'hamburg_documents', label: 'Hamburg (alt)' },
];

const LV_SHORT_NAMES: { code: string; label: string }[] = [
  { code: 'BB', label: 'Brandenburg' },
  { code: 'BE', label: 'Berlin' },
  { code: 'BE-F', label: 'Berlin Fraktion' },
  { code: 'BY', label: 'Bayern' },
  { code: 'BY-F', label: 'Bayern Fraktion' },
  { code: 'HE', label: 'Hessen' },
  { code: 'HE-F', label: 'Hessen Fraktion' },
  { code: 'HH', label: 'Hamburg' },
  { code: 'LSA', label: 'Sachsen-Anhalt' },
  { code: 'LSA-F', label: 'Sachsen-Anhalt Fraktion' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'MV-F', label: 'Mecklenburg-Vorpommern Fraktion' },
  { code: 'SH', label: 'Schleswig-Holstein' },
  { code: 'SL', label: 'Saarland' },
  { code: 'TH', label: 'Thüringen' },
  { code: 'TH-F', label: 'Thüringen Fraktion' },
];

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': env.QDRANT_API_KEY ?? '',
  };
  const basicUser = env.QDRANT_BASIC_AUTH_USERNAME;
  const basicPass = env.QDRANT_BASIC_AUTH_PASSWORD;
  if (basicUser && basicPass) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
  }
  return headers;
}

async function getCollectionCount(qdrantUrl: string, collection: string): Promise<number | null> {
  try {
    const resp = await fetch(`${qdrantUrl}/collections/${collection}/points/count`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: { count?: number } };
    return data.result?.count ?? null;
  } catch {
    return null;
  }
}

async function getLvCount(qdrantUrl: string, code: string): Promise<number | null> {
  try {
    const resp = await fetch(`${qdrantUrl}/collections/landesverbaende_documents/points/count`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        filter: { must: [{ key: 'landesverband', match: { value: code } }] },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: { count?: number } };
    return data.result?.count ?? null;
  } catch {
    return null;
  }
}

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('de-DE');
}

export interface ContentStats {
  markdown: string;
  totalPoints: number;
}

export async function getContentStatsMarkdown(): Promise<ContentStats> {
  const qdrantUrl = (env.QDRANT_URL ?? '').replace(/\/+$/, '');
  if (!qdrantUrl || !env.QDRANT_API_KEY) {
    throw new Error('QDRANT_URL and QDRANT_API_KEY are required');
  }

  const collectionResults = await Promise.all(
    CONTENT_COLLECTIONS.map(async (c) => ({
      ...c,
      count: await getCollectionCount(qdrantUrl, c.name),
    }))
  );

  const lvResults = await Promise.all(
    LV_SHORT_NAMES.map(async (lv) => ({
      ...lv,
      count: await getLvCount(qdrantUrl, lv.code),
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

  return { markdown, totalPoints };
}
