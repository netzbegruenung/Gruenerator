import { HiCheck } from 'react-icons/hi2';

import { cn } from '../../utils/cn.js';

import { MediaPreview, mediaLabel } from './MediaPreview.js';

import type { MediaItem } from '../types.js';
import type { SharedMediaUrlOptions } from './SharedMediaPicture.js';

export interface MediaTileProps extends SharedMediaUrlOptions {
  item: MediaItem;
  selected?: boolean;
  onPick: (item: MediaItem) => void;
  sizes?: string;
}

/** Square, selectable library tile for pickers (canvas, Sites, Slides). */
export function MediaTile({
  item,
  selected = false,
  onPick,
  sizes,
  ...urlOptions
}: MediaTileProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      aria-pressed={selected}
      aria-label={mediaLabel(item)}
      title={item.title ?? item.originalFilename ?? undefined}
      className={cn(
        'relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-background-alt p-0',
        'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        selected
          ? 'border-primary-500'
          : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
      )}
    >
      <MediaPreview item={item} fit="cover" sizes={sizes} {...urlOptions} />
      {item.title && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-left text-[11px] text-white">
          {item.title}
        </span>
      )}
      {selected && (
        <span
          aria-hidden
          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm"
        >
          <HiCheck className="size-4" />
        </span>
      )}
    </button>
  );
}
