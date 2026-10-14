import { PreviewImage } from '@gruenerator/ui';
import { useMemo } from 'react';

import { buildSharedMediaSrcSet } from '../srcset.js';

/** Where shared-media URLs point and how a dead one is reported; varies per host app. */
export interface SharedMediaUrlOptions {
  /** API base path. Defaults to `/api`. */
  baseUrl?: string;
  /** Per-URL transform (e.g. prefix the API origin on desktop). */
  resolveUrl?: (url: string) => string;
  /** The preview answered 410 — the list this tile came from is stale. */
  onGone?: () => void;
}

export interface SharedMediaPictureProps extends SharedMediaUrlOptions {
  shareToken: string;
  alt: string;
  /** BlurHash from `imageMetadata.blurhash`, for an instant placeholder. */
  blurhash?: string;
  /** Intrinsic size from `imageMetadata`, so the box is reserved before the bytes arrive. */
  width?: number;
  height?: number;
  /** Above-the-fold tiles → eager + high priority. */
  priority?: boolean;
  /** `sizes` attribute matching the rendered tile width. */
  sizes?: string;
  /** Override the advertised variant widths (defaults to 200/400/800). */
  widths?: readonly number[];
  /** Width for the plain `<img>` fallback (defaults to 400; use 800 for detail views). */
  fallbackWidth?: number;
  className?: string;
}

/**
 * A shared-media preview image served from the pre-generated responsive
 * AVIF/WebP variants — never `MediaItem.thumbnailUrl`, which is the unresized
 * original (`/preview` without `w`) and pulls megabytes into a 150px tile.
 */
export function SharedMediaPicture({
  shareToken,
  alt,
  blurhash,
  width,
  height,
  priority,
  sizes,
  widths,
  fallbackWidth,
  baseUrl,
  resolveUrl,
  onGone,
  className,
}: SharedMediaPictureProps) {
  const { sources, src } = useMemo(
    () => buildSharedMediaSrcSet(shareToken, { baseUrl, resolveUrl, widths, fallbackWidth }),
    [shareToken, baseUrl, resolveUrl, widths, fallbackWidth]
  );

  return (
    <PreviewImage
      src={src}
      sources={sources}
      alt={alt}
      blurhash={blurhash}
      width={width}
      height={height}
      priority={priority}
      onGone={onGone}
      sizes={sizes}
      className={className}
    />
  );
}
