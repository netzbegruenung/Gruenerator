/**
 * The PDF behind a document of a scraped system collection (Landesverbände,
 * Grundsatzprogramme), for the citation viewer (#6088).
 *
 * Scrapers keep no file: the content sync runs on GitHub runners and drops the
 * download after extraction. So the file is fetched on first view from the
 * URL stored in Qdrant — never from a URL the client sends — and kept in
 * system media under its SHA-256. The stored `file_hash` doubles as the check:
 * bytes that still match what was indexed are cached and served from then on,
 * even if the source later goes away. Bytes that differ (the file changed
 * since the last sync) or a point without a hash are served once, uncached;
 * the next sync re-indexes the file and records its hash.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';
import { fetchPdfDocument } from '../scrapers/implementations/LandesverbandScraper/pdfResponse.js';
import { hashBytes } from '../scrapers/utils/binaryFingerprint.js';
import { getSystemMediaStorage, type SystemMediaStorage } from '../systemMedia/storage.js';

export interface SystemPdfSource {
  /** The file itself, or a WPDM landing page `fetchPdfDocument` resolves. */
  url: string;
  /** SHA-256 of the bytes the index was built from; `null` if the point has none. */
  fileHash: string | null;
}

const SHA256_RE = /^[a-f0-9]{64}$/;

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A point's PDF, if it has one. `pdf_url` (ProgramPdfScraper) is the file
 * where `source_url` is the page about it. A stored `file_hash` is only
 * written by the binary path of the PDF scrapers, so it marks a PDF even
 * behind a landing-page URL; otherwise the URL has to end in `.pdf`.
 * `wolke://` keys and other schemes have no fetchable file.
 */
export function pdfSourceFromPayload(payload: Record<string, unknown>): SystemPdfSource | null {
  const pdfUrl = httpUrl(payload.pdf_url);
  const url = pdfUrl ?? httpUrl(payload.source_url);
  if (!url) return null;
  const fileHash =
    typeof payload.file_hash === 'string' && SHA256_RE.test(payload.file_hash)
      ? payload.file_hash
      : null;
  const isPdf = Boolean(pdfUrl) || fileHash !== null || /\.pdf$/i.test(new URL(url).pathname);
  return isPdf ? { url, fileHash } : null;
}

export async function findSystemPdfSource(
  qdrantCollection: string,
  documentId: string
): Promise<SystemPdfSource | null> {
  const result = await getQdrantInstance()
    .readClient(qdrantCollection)
    .scroll(qdrantCollection, {
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
      limit: 1,
      with_payload: ['source_url', 'pdf_url', 'file_hash'],
      with_vector: false,
    });
  const payload = result.points?.[0]?.payload;
  return payload ? pdfSourceFromPayload(payload) : null;
}

/** Larger than any LV PDF measured (6.2 MB, 11/2026); a Wahlprogramm with scans stays under it. */
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

async function readCapped(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_PDF_BYTES) throw new Error(`PDF too large: ${declared} bytes`);
  if (!response.body) return Buffer.alloc(0);
  const parts: Buffer[] = [];
  let total = 0;
  for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += part.byteLength;
    if (total > MAX_PDF_BYTES) throw new Error(`PDF too large: over ${MAX_PDF_BYTES} bytes`);
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

/**
 * The fetcher `fetchPdfDocument` expects, hardened: every redirect hop is
 * re-validated (`safeFetch`), the body is capped while it streams, and the
 * request gives up after 20 s. The stored URL comes from our own index, but
 * the hosts are third parties and their redirects are not ours to trust.
 */
async function fetchUrlHardened(
  url: string,
  options: { headers: Record<string, string>; acceptStatus: number[] }
): Promise<Response> {
  const response = await safeFetch(url, {
    headers: { ...options.headers, 'User-Agent': 'Gruenerator-Bot/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 304) return new Response(null, { status: 304 });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = await readCapped(response);
  return new Response(new Uint8Array(bytes), {
    status: response.status,
    headers: response.headers,
  });
}

export type SystemOriginal =
  { kind: 'stored'; key: string; size: number } | { kind: 'fresh'; bytes: Buffer };

export interface SystemOriginalDeps {
  storage: SystemMediaStorage;
  fetchUrl: typeof fetchUrlHardened;
}

const defaultDeps = (): SystemOriginalDeps => ({
  storage: getSystemMediaStorage(),
  fetchUrl: fetchUrlHardened,
});

const storageKey = (fileHash: string) => `scraped-pdf/${fileHash}.pdf`;

/** `null` when the source is gone, answers no PDF, or is unreachable. */
export async function loadSystemOriginal(
  source: SystemPdfSource,
  deps: SystemOriginalDeps = defaultDeps()
): Promise<SystemOriginal | null> {
  if (source.fileHash) {
    const key = storageKey(source.fileHash);
    const stat = await deps.storage.stat(key);
    if (stat) return { kind: 'stored', key, size: stat.size };
  }

  const fetched = await fetchPdfDocument(source.url, {}, deps.fetchUrl);
  if (fetched.kind !== 'pdf') return null;

  if (!source.fileHash || hashBytes(fetched.bytes) !== source.fileHash) {
    return { kind: 'fresh', bytes: fetched.bytes };
  }
  const key = storageKey(source.fileHash);
  // Written beside, then moved in: a reader never sees half a file, and two
  // first views racing each other both end with the same complete bytes.
  const tempPath = path.join(os.tmpdir(), `scraped-pdf-${crypto.randomUUID()}.pdf`);
  await fs.writeFile(tempPath, fetched.bytes);
  try {
    await deps.storage.putFromFile(key, tempPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return { kind: 'stored', key, size: fetched.bytes.length };
}
