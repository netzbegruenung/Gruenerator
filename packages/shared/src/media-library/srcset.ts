/**
 * Shared-media responsive thumbnail URL builder.
 *
 * Produces the AVIF + WebP `srcSet` strings (and a single fallback `src`) for a
 * shared-media item, pointing at the backend's `/share/<token>/preview` endpoint
 * with `?w=<width>&fmt=<avif|webp>`. The widths must match those pre-generated
 * by the API (`sharedMediaService.VARIANT_WIDTHS`) so requests hit warm cache.
 *
 * Platform-agnostic: pass `resolveUrl` (e.g. the web app's `resolveApiAssetUrl`
 * so desktop builds get an absolute origin) and `baseUrl` to suit the consumer.
 */

import { sharedMediaPreviewUrl } from './shareUrl.js';

export const DEFAULT_THUMBNAIL_WIDTHS = [200, 400, 800] as const;

export interface SharedMediaSrcSetOptions {
  /** Variant widths to advertise. Defaults to {@link DEFAULT_THUMBNAIL_WIDTHS}. */
  widths?: readonly number[];
  /** API base path. Defaults to `/api`. */
  baseUrl?: string;
  /** Width for the plain `<img>` fallback. Defaults to 400. */
  fallbackWidth?: number;
  /** Per-URL transform (e.g. prefix the API origin on desktop). Defaults to identity. */
  resolveUrl?: (url: string) => string;
}

export interface SharedMediaSrcSet {
  /** `<source>` entries, most-preferred first (AVIF, then WebP). */
  sources: { srcSet: string; type: string }[];
  /** Fallback `<img>` src (a mid-width WebP URL). */
  src: string;
}

function buildPreviewUrl(
  base: string,
  shareToken: string,
  width: number,
  fmt: 'avif' | 'webp',
  resolveUrl: (url: string) => string
): string {
  return resolveUrl(sharedMediaPreviewUrl(shareToken, { baseUrl: base, width, fmt }));
}

export function buildSharedMediaSrcSet(
  shareToken: string,
  options: SharedMediaSrcSetOptions = {}
): SharedMediaSrcSet {
  const widths = options.widths ?? DEFAULT_THUMBNAIL_WIDTHS;
  const base = options.baseUrl ?? '/api';
  const fallbackWidth = options.fallbackWidth ?? 400;
  const resolveUrl = options.resolveUrl ?? ((url: string) => url);

  const srcSetFor = (fmt: 'avif' | 'webp'): string =>
    widths.map((w) => `${buildPreviewUrl(base, shareToken, w, fmt, resolveUrl)} ${w}w`).join(', ');

  return {
    sources: [
      { srcSet: srcSetFor('avif'), type: 'image/avif' },
      { srcSet: srcSetFor('webp'), type: 'image/webp' },
    ],
    src: buildPreviewUrl(base, shareToken, fallbackWidth, 'webp', resolveUrl),
  };
}

const SHARE_DOWNLOAD_RE = /^\/api\/share\/([^/?#]+)\/download$/;
const THUMBS_RE = /^\/api\/thumbs\//;

// The `/api/share/<token>/download` → `/preview` rewrite shared by
// `shareThumbnailPreviewUrl` and `shareCanvasPreviewUrl` (only the width
// default differs).
function shareDownloadPreviewUrl(url: string | undefined, width: number): string | undefined {
  if (!url) return url;
  const match = SHARE_DOWNLOAD_RE.exec(url);
  return match ? `/api/share/${match[1]}/preview?w=${width}&fmt=webp` : url;
}

/**
 * Rewrite a full-resolution media URL to a resized preview variant.
 *
 * A canvas thumbnail URL is the full-resolution render (a multi-MB PNG at
 * pixelRatio 2) — that is what the mobile viewer downloads into the gallery.
 * Card-sized `<img>`s ask for a resized variant instead, served webp from the
 * server's disk cache. Other URLs pass through unchanged, so `blob:` and
 * `data:` sources stay untouched.
 *
 * Two URL shapes because the field is mid-migration: `/api/thumbs/...` (signed,
 * takes `&w=&fmt=`) is what the API emits now; `/api/share/<token>/download` is
 * still what the column stores and what older responses carried.
 */
export function shareThumbnailPreviewUrl(url: string, width?: 200 | 400 | 800): string;
export function shareThumbnailPreviewUrl(
  url: string | undefined,
  width?: 200 | 400 | 800
): string | undefined;
export function shareThumbnailPreviewUrl(
  url: string | undefined,
  width: 200 | 400 | 800 = 400
): string | undefined {
  if (!url) return url;
  if (THUMBS_RE.test(url)) {
    // set, not append: the API already mints these with a default w/fmt, and a
    // second pair would make `req.query.w` an array server-side — which parses
    // as NaN and answers 400, i.e. a broken tile.
    const [path, query] = url.split('?');
    const params = new URLSearchParams(query);
    params.set('w', String(width));
    params.set('fmt', 'webp');
    return `${path}?${params.toString()}`;
  }
  return shareDownloadPreviewUrl(url, width);
}

/**
 * The canvas editor's working tier. The scene is 1080x1350 and the download
 * UI offers 1x/2x export (TopBar/DownloadSection.tsx), so a 2160px source
 * (1080 x 2) is export-quality at the max scale while an element draws at
 * most 1080px wide (half the tier); wider — zoomed or resized — elements
 * render the stored original instead. Must stay a member of the API's
 * `THUMBNAIL_WIDTHS`.
 */
export const CANVAS_PREVIEW_WIDTH = 2160;

/**
 * Rewrite a durable media URL to the working-size variant the canvas renders
 * live — Canva-style: edit on a small WebP preview, keep the original on disk.
 *
 * Only the `/api/share/<token>/download` shape is rewritten — that is exactly
 * what the collab doc stores as `currentImageSrc` — while `blob:` previews,
 * remote stock URLs and anything else pass through unchanged.
 */
export function shareCanvasPreviewUrl(
  url: string | undefined,
  width: number = CANVAS_PREVIEW_WIDTH
): string | undefined {
  return shareDownloadPreviewUrl(url, width);
}
