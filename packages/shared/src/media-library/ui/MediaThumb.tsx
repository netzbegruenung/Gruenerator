import { memo } from 'react';

import { SharedMediaPicture, type SharedMediaUrlOptions } from './SharedMediaPicture.js';

import type { MediaItem } from '../types.js';

export interface MediaThumbProps extends SharedMediaUrlOptions {
  /** Only what the thumb reads, so the canvas editor can hand back its own view of an item. */
  item: Pick<MediaItem, 'shareToken' | 'imageMetadata'>;
  alt: string;
  /** Layout hint for the browser's variant choice. Defaults to a ~200px column. */
  sizes?: string;
  priority?: boolean;
  fallbackWidth?: number;
  /** Defaults to full width at the image's own aspect ratio (masonry-friendly). */
  className?: string;
}

/**
 * The image of a library item. `width`/`height`/`blurhash` ride along in
 * `imageMetadata` (written by `sharedMediaService.processMediaVariants`), so the
 * placeholder and the reserved box cost no extra request; rows predating
 * variant generation simply have none.
 */
export const MediaThumb = memo(function MediaThumb({
  item,
  alt,
  sizes = '200px',
  className = 'w-full h-auto',
  ...rest
}: MediaThumbProps) {
  const { width, height, blurhash } = item.imageMetadata ?? {};
  return (
    <SharedMediaPicture
      shareToken={item.shareToken}
      alt={alt}
      blurhash={blurhash}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      {...rest}
    />
  );
});
