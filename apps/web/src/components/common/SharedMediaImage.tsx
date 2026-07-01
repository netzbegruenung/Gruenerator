import { buildSharedMediaSrcSet } from '@gruenerator/shared/media-library';
import { PreviewImage } from '@gruenerator/ui';
import { useMemo } from 'react';

import { resolveApiAssetUrl } from '../../utils/platform';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export interface SharedMediaImageProps {
  /** The shared-media share token (`shared_media.share_token`). */
  shareToken: string;
  alt: string;
  /** BlurHash from `imageMetadata.blurhash`, for an instant placeholder. */
  blurhash?: string;
  /** Above-the-fold tiles → eager + high priority. */
  priority?: boolean;
  /** `sizes` attribute matching the rendered tile width (improves variant selection). */
  sizes?: string;
  /** Override the advertised variant widths (defaults to 200/400/800). */
  widths?: readonly number[];
  /** Width for the plain `<img>` fallback (defaults to 400; use 800 for detail views). */
  fallbackWidth?: number;
  className?: string;
}

/**
 * The single app-wide standard for rendering a shared-media preview image.
 * Builds responsive AVIF/WebP `srcSet`s pointing at `/share/<token>/preview`,
 * shows a BlurHash placeholder, and lazy/priority-loads — backed by the
 * pre-generated variants from the API. Use this everywhere a `/share/.../preview`
 * image is shown instead of a bespoke `<img>`.
 */
export function SharedMediaImage({
  shareToken,
  alt,
  blurhash,
  priority,
  sizes,
  widths,
  fallbackWidth,
  className,
}: SharedMediaImageProps) {
  const { sources, src } = useMemo(
    () =>
      buildSharedMediaSrcSet(shareToken, {
        baseUrl: API_BASE_URL,
        resolveUrl: resolveApiAssetUrl,
        widths,
        fallbackWidth,
      }),
    [shareToken, widths, fallbackWidth]
  );

  return (
    <PreviewImage
      src={src}
      sources={sources}
      alt={alt}
      blurhash={blurhash}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}
