/**
 * Rendering and caching thumbnail variants.
 *
 * Extracted from the on-demand branch of `/api/share/:token/preview` so the
 * sharp settings and the "send the buffer now, write the file afterwards"
 * ordering exist once rather than twice.
 *
 * Three tiers, cheapest first:
 *   1. a variant pre-generated at upload (`sharedMediaService.generateMediaVariants`)
 *   2. a variant this endpoint rendered earlier
 *   3. a fresh sharp render
 *
 * The cache lives under one root instead of next to each source, because the
 * three kinds' sources live in unrelated trees and a single root makes pruning a
 * one-liner (`find uploads/thumb-cache -type f -atime +90 -delete`) and keeps
 * the source trees write-free.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { type ThumbnailKind } from './thumbnailSignature.js';
import { type ThumbnailFormat, type ThumbnailWidth } from './thumbnailUrl.js';

const fsPromises = fs.promises;
const log = createLogger('thumbnails');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = env.THUMBNAIL_CACHE_DIR ?? path.join(__dirname, '../../uploads/thumb-cache');
const CACHE_ROOT_RESOLVED = path.resolve(CACHE_ROOT);

const CONTENT_TYPE: Record<ThumbnailFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
};

export interface VariantRequest {
  kind: ThumbnailKind;
  id: string;
  /** Content version — a cache-path segment, so superseded entries are visible. */
  v: string;
  /** Absent = serve the original bytes unresized. */
  width: ThumbnailWidth | null;
  fmt: ThumbnailFormat;
}

/**
 * `<kind>/<id[0:2]>/<id>/<v>/w<width>.<fmt>`
 *
 * Sharded by the first two id characters: one flat directory with 100k entries
 * is fine for the filesystem and miserable for every operational task performed
 * on it.
 */
export function variantCachePath(req: VariantRequest & { width: ThumbnailWidth }): string {
  const safeId = path.basename(req.id);
  const safeV = path.basename(req.v);
  const full = path.join(
    CACHE_ROOT,
    req.kind,
    safeId.slice(0, 2),
    safeId,
    safeV,
    `w${req.width}.${req.fmt}`
  );
  if (!path.resolve(full).startsWith(CACHE_ROOT_RESOLVED + path.sep)) {
    throw new Error('Invalid thumbnail cache path');
  }
  return full;
}

async function statFile(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fsPromises.stat(filePath);
  } catch {
    return null;
  }
}

export interface ThumbnailVariant {
  contentType: string;
  /** Byte length, so the caller can set Content-Length in both branches. */
  size: number;
  /** Set for a cache/pre-generated hit — stream it. */
  filePath?: string;
  /** Set for a fresh render — send it. */
  buffer?: Buffer;
}

/**
 * Produce the requested variant, using whichever tier is available.
 *
 * A freshly rendered buffer is returned immediately and written to disk without
 * being awaited: the user's tile should not wait on a filesystem write that only
 * benefits the next request. A failed write costs a re-render, nothing more.
 */
export async function getThumbnailVariant(
  req: VariantRequest,
  source: {
    sourcePath: string;
    contentType: string;
    pregenerated?: { dir: string; base: string };
  }
): Promise<ThumbnailVariant | null> {
  // No width means "the original bytes": the canvas viewer downloads this URL
  // and saves it as the sharepic, so it must not be a re-encode.
  if (!req.width) {
    const stat = await statFile(source.sourcePath);
    if (!stat) return null;
    return { contentType: source.contentType, size: stat.size, filePath: source.sourcePath };
  }

  const sized = { ...req, width: req.width };
  const contentType = CONTENT_TYPE[req.fmt];

  if (source.pregenerated) {
    const upload = path.join(
      source.pregenerated.dir,
      `${source.pregenerated.base}_w${sized.width}.${sized.fmt}`
    );
    const uploadStat = await statFile(upload);
    if (uploadStat) return { contentType, size: uploadStat.size, filePath: upload };
  }

  const cachePath = variantCachePath(sized);
  const cacheStat = await statFile(cachePath);
  if (cacheStat) return { contentType, size: cacheStat.size, filePath: cachePath };

  if (!(await statFile(source.sourcePath))) return null;

  let buffer: Buffer;
  try {
    // `failOn: 'none'` matches the upload-time generator: a truncated file
    // should still yield a preview rather than an error page.
    const resized = sharp(source.sourcePath, { failOn: 'none' }).resize({
      width: sized.width,
      withoutEnlargement: true,
    });
    buffer = await (
      sized.fmt === 'avif' ? resized.avif({ quality: 60 }) : resized.webp({ quality: 78 })
    ).toBuffer();
  } catch (err) {
    log.error('Thumbnail render failed:', err);
    return null;
  }

  void fsPromises
    .mkdir(path.dirname(cachePath), { recursive: true })
    .then(() => fsPromises.writeFile(cachePath, buffer))
    .catch((err: unknown) => {
      log.error('Failed to cache thumbnail:', err);
    });

  return { contentType, size: buffer.length, buffer };
}

/** Stream a cached variant. Separate from the resolver so tests can stub it. */
export function openVariant(filePath: string): fs.ReadStream {
  return fs.createReadStream(filePath);
}
