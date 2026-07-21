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
  return resolveUrl(`${base}/share/${shareToken}/preview?w=${width}&fmt=${fmt}`);
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
