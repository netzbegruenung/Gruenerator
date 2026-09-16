import { buildSharedMediaSrcSet, MEDIA_LIBRARY_QUERY_KEY } from '@gruenerator/shared/media-library';
import { PreviewImage } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { RECENT_ACTIVITY_KEY } from '../../features/workplace/hooks/useRecentActivity';
import { resolveApiAssetUrl } from '../../utils/platform';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// Tokens already reported gone, so one dead tile triggers one refetch and no
// more. Without this a list that kept returning the row — a server bug, but a
// cheap one to guard against — would refetch on every render of the same tile.
const reportedGone = new Set<string>();

// Both lists are built from `shared_media` rows, so a 410 on one of their
// previews means the cached list is stale by definition. Deliberately not
// `['canvas', 'list']`: a canvas is its own row and can outlive the share whose
// preview it borrows, so refetching it would not make the tile go away.
const SHARED_MEDIA_LIST_KEYS = [RECENT_ACTIVITY_KEY, MEDIA_LIBRARY_QUERY_KEY] as const;

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
  const queryClient = useQueryClient();

  // The image degrades to its blurhash on its own; what it cannot do is remove
  // the tile around it. Refetching the lists that are built from `shared_media`
  // does, and the server is the only thing that knows what is really left.
  const handleGone = useCallback(() => {
    if (reportedGone.has(shareToken)) return;
    reportedGone.add(shareToken);
    for (const queryKey of SHARED_MEDIA_LIST_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, shareToken]);

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
      onGone={handleGone}
      sizes={sizes}
      className={className}
    />
  );
}
