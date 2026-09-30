import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { safeFetch } from '../../../utils/validation/urlSecurity.js';

/** On the `api-uploads` volume in production (WORKDIR is apps/api). */
export const LV_SOCIAL_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'lv-social');
/**
 * Relative to the API base, like every media path the clients build with
 * `VITE_API_BASE_URL` (the desktop app has no same-origin `/api`).
 */
export const LV_SOCIAL_IMAGE_PATH = '/lv-social/images';

const WIDTH = 480;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AGE_DAYS = 90;
const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Downloads the post image and stores it as webp. Returns the public path, or
 * null when anything fails — a post without image is still worth showing.
 */
export async function storeLvSocialImage(
  shortCode: string,
  imageUrl: string
): Promise<string | null> {
  if (!SHORTCODE_RE.test(shortCode)) return null;
  const res = await safeFetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const webp = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const file = `${shortCode}.webp`;
  await fs.mkdir(LV_SOCIAL_IMAGE_DIR, { recursive: true });
  await fs.writeFile(path.join(LV_SOCIAL_IMAGE_DIR, file), webp);
  return `${LV_SOCIAL_IMAGE_PATH}/${file}`;
}

/** The overview only shows the newest posts; older images are dead weight. */
export async function pruneLvSocialImages(now = Date.now()): Promise<number> {
  const cutoff = now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  let files: string[];
  try {
    files = await fs.readdir(LV_SOCIAL_IMAGE_DIR);
  } catch {
    return 0;
  }
  for (const file of files) {
    const full = path.join(LV_SOCIAL_IMAGE_DIR, file);
    const stat = await fs.stat(full);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(full);
      removed++;
    }
  }
  return removed;
}
