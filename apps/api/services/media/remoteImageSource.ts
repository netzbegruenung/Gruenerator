/**
 * A remote image (a crawled Canva `og:image`, say) as a local source file for
 * the thumbnail pipeline — fetched once, then served from disk.
 *
 * Without this, a gallery tile pointing at a remote URL makes every viewer pull
 * the full-size original from a third-party host on every visit, and tells that
 * host who looked. Through `/api/thumbs` it becomes one fetch per URL, ever, and
 * a resized, immutable-cached WebP for everyone.
 *
 * The URL is user-supplied (it was crawled from a link a user entered), so it
 * goes through `safeFetch` only: every redirect hop is re-validated against the
 * SSRF rules. The bytes must decode as an image, or nothing is cached.
 *
 * Keyed by the URL. Content that changes behind an unchanged URL keeps the first
 * copy — the same trade the mint side makes with `versionFromUrl`.
 */

import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

import { remoteSourceDir } from './thumbnailCache.js';

const fsPromises = fs.promises;
const log = createLogger('thumbnails');

const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** sharp's format name → the mime type served for the original bytes. */
const FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heif: 'image/heif',
};

export interface RemoteSource {
  sourcePath: string;
  contentType: string;
}

/** One fetch per URL even when a whole gallery page asks at once. */
const inFlight = new Map<string, Promise<RemoteSource | null>>();

const hashUrl = (url: string): string => createHash('sha256').update(url).digest('hex');

async function cached(dir: string): Promise<RemoteSource | null> {
  try {
    const entry = (await fsPromises.readdir(dir)).find((name) => name.startsWith('source.'));
    const format = entry?.slice('source.'.length);
    if (!entry || !format || !FORMATS[format]) return null;
    return { sourcePath: path.join(dir, entry), contentType: FORMATS[format] };
  } catch {
    return null;
  }
}

async function readCapped(response: Response): Promise<Buffer | null> {
  if (!response.ok || !response.body) return null;
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchAndStore(url: string, dir: string): Promise<RemoteSource | null> {
  try {
    const response = await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const bytes = await readCapped(response);
    if (!bytes) return null;

    const { format } = await sharp(bytes, { failOn: 'none' }).metadata();
    const contentType = format ? FORMATS[format] : undefined;
    if (!format || !contentType) return null;

    // Write aside, then rename, like the variant cache (#3818).
    const sourcePath = path.join(dir, `source.${format}`);
    const tmpPath = `${sourcePath}.${process.pid}.${randomUUID()}.tmp`;
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(tmpPath, bytes);
    await fsPromises.rename(tmpPath, sourcePath);
    return { sourcePath, contentType };
  } catch (err) {
    // A dead or refused remote is an expected state for user-supplied links.
    log.debug(`Remote source unavailable: ${(err as Error).message}`);
    return null;
  }
}

export async function getRemoteImageSource(url: string): Promise<RemoteSource | null> {
  const dir = remoteSourceDir(hashUrl(url));
  const hit = await cached(dir);
  if (hit) return hit;

  const pending = inFlight.get(url);
  if (pending) return pending;
  const fetching = fetchAndStore(url, dir).finally(() => inFlight.delete(url));
  inFlight.set(url, fetching);
  return fetching;
}
