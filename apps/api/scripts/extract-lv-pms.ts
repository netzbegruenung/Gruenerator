/**
 * Extract: Last 20 PMs per Landesverband / Fraktion source for corpus analysis.
 *
 * Scrolls landesverbaende_documents per (landesverband, source_type), deduplicates
 * by URL (Qdrant stores chunked PMs as multiple points), sorts by published_at DESC,
 * writes the top 20 as JSON to docs/landesverbaende/_raw/.
 *
 * Usage: npx tsx apps/api/scripts/extract-lv-pms.ts
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
const COLLECTION = 'landesverbaende_documents';
const OUTPUT_DIR = path.resolve(process.cwd(), 'documentation/docs/landesverbaende/_raw');
const TOP_N = 20;

type SourceType = 'landesverband' | 'fraktion';

interface LvTarget {
  slug: string;
  display: string;
  lvCode: string;
  fraktionCode: string | null;
}

const TARGETS: LvTarget[] = [
  { slug: 'berlin', display: 'Berlin', lvCode: 'BE', fraktionCode: 'BE-F' },
  { slug: 'hamburg', display: 'Hamburg', lvCode: 'HH', fraktionCode: null },
  {
    slug: 'mecklenburg-vorpommern',
    display: 'Mecklenburg-Vorpommern',
    lvCode: 'MV',
    fraktionCode: 'MV-F',
  },
  { slug: 'thueringen', display: 'Thüringen', lvCode: 'TH', fraktionCode: 'TH-F' },
  { slug: 'brandenburg', display: 'Brandenburg', lvCode: 'BB', fraktionCode: null },
];

interface QdrantPoint {
  id: string | number;
  payload?: Record<string, unknown>;
}

interface ScrollResult {
  result?: { points?: QdrantPoint[]; next_page_offset?: string | number | null };
}

interface PmRecord {
  document_id: string;
  source_url: string | null;
  title: string;
  published_at: string | null;
  content: string;
  source_id: string | null;
  source_type: string | null;
  landesverband: string | null;
  primary_category: string | null;
  subcategories: string[];
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

async function qdrantPost(path: string, body: Record<string, unknown> = {}): Promise<ScrollResult> {
  const resp = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<ScrollResult>;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

async function scrollAll(lvCode: string, sourceType: SourceType): Promise<QdrantPoint[]> {
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
          { key: 'content_type', match: { value: 'presse' } },
          { key: 'source_type', match: { value: sourceType } },
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

function dedupeByDocument(points: QdrantPoint[]): PmRecord[] {
  const byDoc = new Map<string, PmRecord>();
  for (const p of points) {
    const payload = p.payload ?? {};
    const docId = asString(payload.document_id);
    if (!docId) continue;
    // Prefer chunks that carry `full_text` (the complete PM, usually on chunk_index 0).
    // Fall back to the longest `chunk_text` if no chunk has full_text.
    const fullText = asString(payload.full_text);
    const chunkText = asString(payload.chunk_text) ?? '';
    const candidateContent = fullText ?? chunkText;
    const existing = byDoc.get(docId);
    const existingIsFull = existing?.content && existing.content.length > 1000 && !!fullText;
    if (
      !existing ||
      (fullText && !existingIsFull) ||
      candidateContent.length > existing.content.length
    ) {
      byDoc.set(docId, {
        document_id: docId,
        source_url: asString(payload.source_url),
        title: asString(payload.title) ?? '',
        published_at: asString(payload.published_at),
        content: candidateContent,
        source_id: asString(payload.source_id),
        source_type: asString(payload.source_type),
        landesverband: asString(payload.landesverband),
        primary_category: asString(payload.primary_category),
        subcategories: asStringArray(payload.subcategories),
      });
    }
  }
  return [...byDoc.values()];
}

function sortByDateDesc(records: PmRecord[]): PmRecord[] {
  return records.slice().sort((a, b) => {
    const ad = a.published_at ?? '';
    const bd = b.published_at ?? '';
    return bd.localeCompare(ad);
  });
}

async function processTarget(
  target: LvTarget,
  sourceType: SourceType,
  code: string
): Promise<void> {
  const label = `${target.slug}-${sourceType}`;
  console.log(`\n→ ${label} (filter landesverband=${code}, source_type=${sourceType})`);

  const points = await scrollAll(code, sourceType);
  console.log(`  scrolled ${points.length} chunks`);

  const deduped = dedupeByDocument(points);
  console.log(`  deduplicated to ${deduped.length} distinct PMs`);

  const sorted = sortByDateDesc(deduped);
  const top = sorted.slice(0, TOP_N);

  if (top.length < TOP_N) {
    console.warn(`  ⚠ only ${top.length} PMs available (requested ${TOP_N})`);
  }

  const outPath = path.join(OUTPUT_DIR, `${label}.json`);
  await fs.writeFile(outPath, JSON.stringify(top, null, 2), 'utf-8');
  console.log(`  wrote ${outPath}`);

  if (top[0]) {
    console.log(`  newest: ${top[0].published_at} — ${top[0].title.slice(0, 80)}`);
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
    await processTarget(target, 'landesverband', target.lvCode);
    if (target.fraktionCode) {
      await processTarget(target, 'fraktion', target.fraktionCode);
    }
  }

  console.log('\n✓ done');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
