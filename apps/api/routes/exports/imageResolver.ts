/**
 * Resolves `image` blocks to embeddable bitmap data for the DOCX export.
 *
 * Every source is user-supplied (chat markdown), so http(s) URLs go through
 * `validateUrlForFetch` — and through it AGAIN on every redirect hop, because a
 * public URL that 302s to 169.254.169.254 passes a single up-front check.
 * Anything that fails — protocol, size, unknown format, timeout — simply stays
 * unresolved; the renderer then falls back to the alt-text link the export
 * emitted before images existed. A broken picture must never break the
 * download.
 */

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

import type { FormattedBlock } from './types.js';

const log = createLogger('exportImageResolver');

export interface ResolvedImage {
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  data: Buffer;
  /** Display size in px, already scaled to fit the page. */
  width: number;
  height: number;
}

/** A4 content box at 96 dpi (210mm minus 1in margins ≈ 160mm ≈ 600px). */
const MAX_WIDTH_PX = 600;
const MAX_HEIGHT_PX = 800;

const MAX_IMAGES = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

interface SniffedImage {
  type: ResolvedImage['type'];
  width: number;
  height: number;
}

/**
 * Format and pixel size from the file header alone. Word needs both up front
 * (`ImageRun` takes no "measure it yourself"), and pulling in an image library
 * for four fixed-offset headers is not worth a dependency.
 */
export function sniffImage(data: Buffer): SniffedImage | null {
  if (data.length >= 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { type: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }

  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    return sniffJpeg(data);
  }

  if (data.length >= 10 && data.toString('latin1', 0, 4).startsWith('GIF8')) {
    return { type: 'gif', width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }

  if (data.length >= 26 && data[0] === 0x42 && data[1] === 0x4d) {
    return {
      type: 'bmp',
      width: Math.abs(data.readInt32LE(18)),
      height: Math.abs(data.readInt32LE(22)),
    };
  }

  return null;
}

/** Walk JPEG segments to the first SOF marker, which carries the dimensions. */
function sniffJpeg(data: Buffer): SniffedImage | null {
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = data[i + 1];
    // Padding / standalone markers carry no length field.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { type: 'jpg', width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
    }
    i += 2 + data.readUInt16BE(i + 2);
  }
  return null;
}

/** Fit the natural size into the page box without ever scaling up. */
function fitToPage(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: MAX_WIDTH_PX, height: MAX_WIDTH_PX };
  const scale = Math.min(MAX_WIDTH_PX / width, MAX_HEIGHT_PX / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fromDataUri(src: string): Buffer | null {
  const match = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(src);
  if (!match) return null;
  try {
    const data = Buffer.from(match[1], 'base64');
    return data.length > 0 && data.length <= MAX_BYTES ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch with manual redirects so each hop is SSRF-validated on its own.
 */
async function fetchImageBytes(src: string): Promise<Buffer | null> {
  let url = src;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await validateUrlForFetch(url, { allowedProtocols: ['https:'] });
    if (!check.isValid || !check.url) {
      log.debug(`[imageResolver] rejected ${url}: ${check.error}`);
      return null;
    }

    const response = await fetch(check.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'image/*' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      url = new URL(location, check.url).toString();
      continue;
    }

    if (!response.ok) return null;

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) return null;

    const data = Buffer.from(await response.arrayBuffer());
    return data.length > 0 && data.length <= MAX_BYTES ? data : null;
  }

  return null;
}

async function resolveOne(src: string): Promise<ResolvedImage | null> {
  const data = src.startsWith('data:') ? fromDataUri(src) : await fetchImageBytes(src);
  if (!data) return null;

  const sniffed = sniffImage(data);
  if (!sniffed || sniffed.width <= 0 || sniffed.height <= 0) return null;

  return { type: sniffed.type, data, ...fitToPage(sniffed.width, sniffed.height) };
}

/**
 * Resolve the images referenced by `blocks`, keyed by their `src`. Sources
 * beyond the first `MAX_IMAGES` unique ones stay unresolved (alt-text
 * fallback), as does anything that fails to load or parse.
 */
export async function resolveImages(blocks: FormattedBlock[]): Promise<Map<string, ResolvedImage>> {
  const sources: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'image' && !sources.includes(block.src)) sources.push(block.src);
  }

  const resolved = new Map<string, ResolvedImage>();
  await Promise.all(
    sources.slice(0, MAX_IMAGES).map(async (src) => {
      try {
        const image = await resolveOne(src);
        if (image) resolved.set(src, image);
      } catch (err) {
        log.debug(`[imageResolver] failed to resolve ${src}: ${(err as Error).message}`);
      }
    })
  );

  return resolved;
}
