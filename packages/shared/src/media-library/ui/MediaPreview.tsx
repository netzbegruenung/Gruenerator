import { HiOutlineMusicalNote, HiPlay } from 'react-icons/hi2';

import { cn } from '../../utils/cn.js';
import { formatAudioDuration } from '../../utils/formatAudioDuration.js';

import { MediaThumb } from './MediaThumb.js';
import { type SharedMediaUrlOptions } from './SharedMediaPicture.js';

import type { MediaItem } from '../types.js';

export function mediaLabel(item: MediaItem): string {
  return item.altText || item.title || item.originalFilename || 'Medium';
}

/** The streamable/original URL of a video or audio item (not for `<img>`). */
export function mediaStreamUrl(item: MediaItem, options: SharedMediaUrlOptions = {}): string {
  const base = options.baseUrl ?? '/api';
  const path = item.mediaType === 'audio' ? 'stream' : 'preview';
  const url = `${base}/share/${item.shareToken}/${path}`;
  return options.resolveUrl ? options.resolveUrl(url) : url;
}

export interface MediaPreviewProps extends SharedMediaUrlOptions {
  item: MediaItem;
  /**
   * `contain` keeps the whole motif (gallery cards, detail view); `cover` fills
   * the box (compact picker tiles).
   */
  fit?: 'contain' | 'cover';
  /** Detail view: playable video and audio, larger image variant. */
  detail?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * One media item, whatever its type: the responsive image, a video (a muted
 * first frame in tiles, with controls in the detail view) or an audio
 * placeholder/player. Fills its parent; the parent sets the box.
 */
export function MediaPreview({
  item,
  fit = 'contain',
  detail = false,
  priority,
  sizes,
  className,
  ...urlOptions
}: MediaPreviewProps) {
  const media = cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain', className);

  if (item.mediaType === 'video') {
    return detail ? (
      <video
        src={mediaStreamUrl(item, urlOptions)}
        controls
        playsInline
        preload="metadata"
        className={media}
      />
    ) : (
      <span className="relative block size-full">
        <video
          src={mediaStreamUrl(item, urlOptions)}
          muted
          playsInline
          preload="metadata"
          aria-hidden
          className={media}
        />
        <span
          aria-hidden
          className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-[#0f1210]/60 text-white backdrop-blur-sm"
        >
          <HiPlay className="size-5" />
        </span>
      </span>
    );
  }

  if (item.mediaType === 'audio') {
    return detail ? (
      <span className="flex size-full items-center justify-center p-md">
        <audio src={mediaStreamUrl(item, urlOptions)} controls className="w-full" />
      </span>
    ) : (
      <span className="flex size-full flex-col items-center justify-center gap-1 text-grey-500">
        <HiOutlineMusicalNote className="size-8" aria-hidden />
        {item.duration ? (
          <span className="text-xs">{formatAudioDuration(item.duration)}</span>
        ) : null}
      </span>
    );
  }

  return (
    <MediaThumb
      item={item}
      alt={mediaLabel(item)}
      priority={priority}
      sizes={sizes}
      fallbackWidth={detail ? 800 : undefined}
      className={media}
      {...urlOptions}
    />
  );
}
