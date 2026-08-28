/**
 * Building thumbnail URLs — the mint side of `thumbnailSignature`.
 *
 * Everything here runs inside list mappers, so it must stay allocation-cheap and
 * must never touch the filesystem: a recent-activity response mints ~50 of
 * these, and a `stat()` per row would turn a 2 ms mapper into a 50 ms one.
 *
 * URLs are origin-relative. An absolute URL would bake a host into data that
 * ends up in client caches and in the canvas `thumbnail_url` column, and would
 * point a dev build at production. Resolving against the API origin is the
 * client's job.
 */

import {
  signThumbnail,
  type ThumbnailDescriptor,
  type ThumbnailKind,
} from './thumbnailSignature.js';

/**
 * The widths the endpoint will render. A closed set rather than a range: `w` is
 * unsigned, so an open range would let one valid handle drive a thousand
 * distinct sharp renders and a thousand cache files.
 *
 * 200/400/800 match the variants pre-generated at upload
 * (`sharedMediaService.VARIANT_WIDTHS`) so those requests never render anything;
 * 1200 exists for full-bleed mobile views and is always rendered on demand;
 * 2160 is the canvas editor's working tier — the scene is 1080x1350 and
 * exports at container x 2, so this width is export-quality — and is rendered
 * on demand like 1200.
 */
export const THUMBNAIL_WIDTHS = [200, 400, 800, 1200, 2160] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

export const THUMBNAIL_FORMATS = ['webp', 'avif'] as const;
export type ThumbnailFormat = (typeof THUMBNAIL_FORMATS)[number];

/** The tile size every list surface uses. */
export const DEFAULT_THUMBNAIL_WIDTH = 400 satisfies ThumbnailWidth;

export function isThumbnailWidth(value: number): value is ThumbnailWidth {
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(value);
}

export function isThumbnailFormat(value: string): value is ThumbnailFormat {
  return (THUMBNAIL_FORMATS as readonly string[]).includes(value);
}

/**
 * The signed path without `w`/`fmt`, for consumers that compose their own
 * srcset. Safe precisely because width and format are not signed — see
 * thumbnailSignature.ts.
 */
export function buildThumbnailBase(d: ThumbnailDescriptor): string | null {
  const sig = signThumbnail(d);
  if (!sig) return null;
  return `/api/thumbs/${d.kind}/${encodeURIComponent(d.id)}/${encodeURIComponent(d.v)}?sig=${sig}`;
}

/**
 * A ready-to-render thumbnail URL, or null when signing is not configured — in
 * which case the caller omits the field and the surface falls back to its
 * placeholder. Never return an unsigned URL: it would 403 and look like a bug.
 */
export function buildThumbnailUrl(
  d: ThumbnailDescriptor,
  opts: { w?: ThumbnailWidth; fmt?: ThumbnailFormat } = {}
): string | null {
  const base = buildThumbnailBase(d);
  if (!base) return null;
  const parts: string[] = [];
  if (opts.w) parts.push(`w=${opts.w}`);
  if (opts.fmt) parts.push(`fmt=${opts.fmt}`);
  return parts.length > 0 ? `${base}&${parts.join('&')}` : base;
}

/** The 400px WebP tile, the shape every list surface wants. */
export function buildThumbnailTileUrl(kind: ThumbnailKind, id: string, v: string): string | null {
  return buildThumbnailUrl({ kind, id, v }, { w: DEFAULT_THUMBNAIL_WIDTH, fmt: 'webp' });
}

/**
 * A content version from a timestamp already present in the row.
 *
 * The version is a cache-buster, never a selector: the route resolves `kind`+`id`
 * to whatever the source is *now* and uses `v` only as signed material and as a
 * cache-path segment. If it selected content it would be a second identifier
 * with its own IDOR surface.
 *
 * Second resolution, base36 — enough to change whenever the row is touched,
 * short enough to keep URLs readable.
 */
export function versionFromDate(value: Date | string | null | undefined): string {
  if (!value) return '0';
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) return '0';
  return Math.floor(ms / 1000).toString(36);
}

/**
 * A content version from a share token.
 *
 * Used for canvases, where it is exact rather than approximate: re-rendering a
 * canvas mints a NEW thumbnail share and deletes the superseded one
 * (`canvasRepository.deleteReplacedThumbnailShare`), so the token changes
 * precisely when the pixels do — and a stale URL 404s instead of quietly
 * serving the old picture.
 */
export function versionFromShareToken(token: string): string {
  return token.slice(0, 8);
}

/**
 * The content version of a media share.
 *
 * `created_at` alone is NOT enough, and this is the whole reason this helper
 * exists: `updateImageShare` (the gallery edit flow) overwrites `media.<ext>`
 * under the SAME share token. The row's creation time does not move, so a
 * version derived from it would leave every client that already fetched the
 * tile showing the pre-edit picture for a year — the exact staleness the
 * version segment is supposed to make impossible.
 *
 * The edit writes `image_metadata.updatedAt`, so that is the authority when
 * present. (The server already drops its own `thumbs/` cache on edit; it is
 * only the clients that need a changed URL.)
 */
export function versionFromShareRow(row: {
  created_at?: Date | string | null;
  image_metadata?: unknown;
}): string {
  const metadata = row.image_metadata as { updatedAt?: unknown } | null | undefined;
  const updatedAt = typeof metadata?.updatedAt === 'string' ? metadata.updatedAt : null;
  return versionFromDate(updatedAt ?? row.created_at ?? null);
}

/**
 * The shape web writes into `canvas_documents.thumbnail_url`: the canvas
 * thumbnail is uploaded to the media library and stored as its download URL.
 * Kept in one place because both the mint side (for the version token) and the
 * resolver (for the source file) have to read it.
 */
const SHARE_DOWNLOAD_URL_RE = /^\/api\/share\/([^/?#]+)\/download$/;

export function shareTokenFromDownloadUrl(url: string): string | null {
  return SHARE_DOWNLOAD_URL_RE.exec(url)?.[1] ?? null;
}

/**
 * A canvas tile URL, or null when the canvas has no thumbnail yet (nothing has
 * rendered it) or its stored URL is not one we can resolve.
 */
export function buildCanvasThumbnailUrl(
  canvasId: string,
  storedThumbnailUrl: string | null,
  opts: { w?: ThumbnailWidth; fmt?: ThumbnailFormat } = {
    w: DEFAULT_THUMBNAIL_WIDTH,
    fmt: 'webp',
  }
): string | null {
  if (!storedThumbnailUrl) return null;
  const token = shareTokenFromDownloadUrl(storedThumbnailUrl);
  if (!token) return null;
  return buildThumbnailUrl({ kind: 'canvas', id: canvasId, v: versionFromShareToken(token) }, opts);
}
