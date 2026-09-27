import { buildSharedMediaSrcSet } from '@gruenerator/shared/media-library';
import { PreviewImage } from '@gruenerator/ui';
import { memo } from 'react';

import type { MediaItem } from '@gruenerator/shared/media-library';

/**
 * Gallery tile for a media-library item, for the 2-column sidebar grids.
 *
 * Served from the backend's responsive `/preview` variants (200/400/800px
 * AVIF+WebP) rather than the full-resolution original. That distinction is the
 * whole point: `MediaItem.thumbnailUrl` is `/api/share/<token>/preview` *without*
 * a `w` parameter, and the API treats a missing width as "the original bytes,
 * unresized" — so rendering that field directly pulls a multi-megabyte source
 * image into a ~150px column, eagerly, for every one of up to 50 tiles a page.
 *
 * `width`/`height`/`blurhash` already ride along in `imageMetadata` (written by
 * `sharedMediaService.processMediaVariants`), so the placeholder and the
 * reserved box cost no extra request. The intrinsic size on the `<img>` lets the
 * browser hold the right height before the bytes arrive; rows predating variant
 * generation simply have none and fall back to today's behaviour.
 */
export const MediaThumb = memo(function MediaThumb({
  item,
  alt,
  sizes = '200px',
}: {
  item: MediaItem;
  alt: string;
  /** Layout hint for the browser's variant choice. Defaults to the 2-column sidebar. */
  sizes?: string;
}) {
  const { sources, src } = buildSharedMediaSrcSet(item.shareToken);
  const { width, height, blurhash } = item.imageMetadata ?? {};

  return (
    <PreviewImage
      src={src}
      sources={sources}
      blurhash={blurhash}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className="w-full h-auto"
    />
  );
});
