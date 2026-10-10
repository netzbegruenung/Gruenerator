/**
 * Pixelmaße des Vorlagen-Thumbnails, einmal gemessen und in
 * `user_templates.metadata.thumbnail_size` abgelegt — die Galerie-Karte leitet
 * daraus das Seitenverhältnis ab, statt bei jedem Seitenaufruf im Browser zu
 * messen. Die URL wird mitgespeichert: neu gemessen wird nur, wenn sich das
 * Thumbnail ändert.
 */

import { shareTokenFromShareUrl } from '@gruenerator/shared/media-library/shareUrl';
import sharp from 'sharp';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

export interface ThumbnailSize {
  url: string;
  width: number;
  height: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const isSize = (w: unknown, h: unknown): boolean =>
  typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0;

/** Hochgeladene Bilder (`/share/<token>`) kennen ihre Maße schon aus der Upload-Pipeline. */
async function sharedMediaSize(token: string): Promise<{ width: number; height: number } | null> {
  const postgres = getPostgresInstance();
  const row = await postgres.queryOne<{ width: unknown; height: unknown }>(
    `SELECT (image_metadata->>'width')::int AS width, (image_metadata->>'height')::int AS height
       FROM shared_media WHERE share_token = $1 AND deleted_at IS NULL`,
    [token],
    { table: 'shared_media' }
  );
  return row && isSize(row.width, row.height)
    ? { width: row.width as number, height: row.height as number }
    : null;
}

/** Externe Bilder (meist Canva-`og:image`) — nutzergeliefert, daher nur über `safeFetch`. */
async function remoteImageSize(url: string): Promise<{ width: number; height: number } | null> {
  const response = await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok || !response.body) return null;
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) return null;
    chunks.push(chunk);
  }

  const meta = await sharp(Buffer.concat(chunks)).metadata();
  if (!isSize(meta.width, meta.height)) return null;
  // EXIF 5–8 = um 90° gedreht: angezeigt werden Breite und Höhe vertauscht.
  const rotated = (meta.orientation ?? 1) >= 5;
  return rotated
    ? { width: meta.height as number, height: meta.width as number }
    : { width: meta.width as number, height: meta.height as number };
}

export async function measureThumbnail(url: string): Promise<ThumbnailSize | null> {
  const token = shareTokenFromShareUrl(url);
  const size = token
    ? await sharedMediaSize(token)
    : /^https?:\/\//i.test(url)
      ? await remoteImageSize(url)
      : null;
  return size ? { url, ...size } : null;
}

/**
 * Misst das Thumbnail, falls für genau diese URL noch keine Maße gespeichert
 * sind, und mergt sie atomar in `metadata` — ein paralleles Metadaten-Update
 * des Nutzers geht dabei nicht verloren.
 */
export async function ensureThumbnailSize(
  templateId: string,
  thumbnailUrl: string | null,
  metadata: unknown
): Promise<ThumbnailSize | null> {
  if (!thumbnailUrl) return null;
  const stored = (metadata as { thumbnail_size?: ThumbnailSize } | null)?.thumbnail_size;
  if (stored?.url === thumbnailUrl) return stored;

  const size = await measureThumbnail(thumbnailUrl);
  if (!size) return null;

  await getPostgresInstance().query(
    `UPDATE user_templates
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('thumbnail_size', $2::jsonb)
      WHERE id = $1`,
    [templateId, JSON.stringify(size)],
    { table: 'user_templates' }
  );
  return size;
}
