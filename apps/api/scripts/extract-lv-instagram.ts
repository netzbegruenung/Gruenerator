/**
 * Extract: All Instagram posts per Landesverband for corpus analysis.
 *
 * Scrolls social_media_examples filtered by (landesverband, platform=instagram)
 * and writes one JSON file per LV to documentation/docs/landesverbaende/_raw/.
 *
 * Sibling of extract-lv-pms.ts. Differences vs. press:
 *   - Single collection (`social_media_examples`), no chunk dedup needed
 *     (each Instagram post is one Qdrant point).
 *   - No fraktion split — LV_SOCIAL_ACCOUNTS only carries main accounts.
 *   - No published_at in payload (Apify Instagram-scraper output doesn't
 *     carry a reliable post timestamp through the current Scraper code),
 *     so records sort by created_at (= indexing time) as a fallback.
 *   - Writes ALL posts per LV (typically 49–50), not a Top-N slice — the
 *     LV-Instagram corpus is intentionally bounded by Apify max-posts.
 *
 * Usage: npx tsx apps/api/scripts/extract-lv-instagram.ts
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY, QDRANT_BASIC_AUTH_USERNAME, QDRANT_BASIC_AUTH_PASSWORD
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

const QDRANT_URL = (process.env.QDRANT_URL ?? '').replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
const BASIC_USER = process.env.QDRANT_BASIC_AUTH_USERNAME;
const BASIC_PASS = process.env.QDRANT_BASIC_AUTH_PASSWORD;
const COLLECTION = 'social_media_examples';
const OUTPUT_DIR = path.resolve(process.cwd(), 'documentation/docs/landesverbaende/_raw');

interface LvTarget {
  slug: string;
  display: string;
  lvCode: string;
}

const TARGETS: LvTarget[] = [
  { slug: 'berlin', display: 'Berlin', lvCode: 'BE' },
  { slug: 'hamburg', display: 'Hamburg', lvCode: 'HH' },
  { slug: 'mecklenburg-vorpommern', display: 'Mecklenburg-Vorpommern', lvCode: 'MV' },
  { slug: 'thueringen', display: 'Thüringen', lvCode: 'TH' },
  { slug: 'brandenburg', display: 'Brandenburg', lvCode: 'BB' },
];

interface QdrantPoint {
  id: string | number;
  payload?: Record<string, unknown>;
}

interface ScrollResult {
  result?: { points?: QdrantPoint[]; next_page_offset?: string | number | null };
}

interface InstagramRecord {
  example_id: string;
  source_url: string;
  content: string;
  platform: string;
  source_account: string | null;
  country: string | null;
  landesverband: string | null;
  created_at: string | null;
}

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

async function qdrantPost(p: string, body: Record<string, unknown> = {}): Promise<ScrollResult> {
  const resp = await fetch(`${QDRANT_URL}${p}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${p} failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<ScrollResult>;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

async function scrollAll(lvCode: string): Promise<QdrantPoint[]> {
  const points: QdrantPoint[] = [];
  let offset: string | number | null = null;
  const pageSize = 256;

  while (true) {
    const body: Record<string, unknown> = {
      limit: pageSize,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          { key: 'landesverband', match: { value: lvCode } },
          { key: 'platform', match: { value: 'instagram' } },
        ],
      },
    };
    if (offset !== null) body.offset = offset;

    const data = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const batch = data.result?.points ?? [];
    if (batch.length === 0) break;
    points.push(...batch);
    offset = data.result?.next_page_offset ?? null;
    if (offset === null) break;
  }
  return points;
}

function toRecord(p: QdrantPoint): InstagramRecord | null {
  const payload = p.payload ?? {};
  const exampleId = asString(payload.example_id);
  const content = asString(payload.content);
  if (!exampleId || !content) return null;
  return {
    example_id: exampleId,
    source_url: exampleId,
    content,
    platform: asString(payload.platform) ?? 'instagram',
    source_account: asString(payload.source_account),
    country: asString(payload.country),
    landesverband: asString(payload.landesverband),
    created_at: asString(payload.created_at),
  };
}

function sortByCreatedDesc(records: InstagramRecord[]): InstagramRecord[] {
  return records.slice().sort((a, b) => {
    const ad = a.created_at ?? '';
    const bd = b.created_at ?? '';
    return bd.localeCompare(ad);
  });
}

async function processTarget(target: LvTarget): Promise<void> {
  const label = `${target.slug}-instagram`;
  console.log(`\n→ ${label} (filter landesverband=${target.lvCode}, platform=instagram)`);

  const points = await scrollAll(target.lvCode);
  console.log(`  scrolled ${points.length} points`);

  const records = points.map(toRecord).filter((r): r is InstagramRecord => r !== null);
  console.log(`  ${records.length} valid records`);

  const sorted = sortByCreatedDesc(records);
  const outPath = path.join(OUTPUT_DIR, `${label}.json`);
  await fs.writeFile(outPath, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`  wrote ${outPath}`);

  if (sorted[0]) {
    const preview = sorted[0].content.slice(0, 80).replace(/\s+/g, ' ');
    console.log(`  first: @${sorted[0].source_account} — ${preview}…`);
  }
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('QDRANT_URL and QDRANT_API_KEY are required');
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log(`Qdrant: ${QDRANT_URL} / ${COLLECTION}`);

  for (const target of TARGETS) {
    await processTarget(target);
  }

  console.log('\n✓ done');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
