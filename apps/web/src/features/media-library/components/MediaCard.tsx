import { MediaPreview } from '@gruenerator/shared/media-library/ui';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InteractiveCard,
} from '@gruenerator/ui';
import { Download, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react';
import { memo, type JSX } from 'react';

import { galleryCard, overlayAction, overlayRow } from '../../../components/common/Gallery/parts';
import { useSharedMediaUrlOptions } from '../../../components/common/SharedMediaImage';
import { formatFileSize, formatMediaDate, mediaKindLabel, mediaTitle } from '../mediaFormat';

import type { MediaItem } from '@gruenerator/shared/media-library';

import { cn } from '@/utils/cn';

// Small grid tiles render ~230px (165px on mobile), large ones up to ~400px.
const CARD_SIZES = '(max-width: 768px) 50vw, 400px';

export interface MediaCardProps {
  item: MediaItem;
  /** Grid index; the first row loads eagerly (better LCP). */
  index?: number;
  onOpen: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  /** Omitted for items that cannot be shared (audio). */
  onShare?: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

/**
 * Mediathek card in the Vorlagen look: the item contained on a square neutral
 * stage (never cropped), download and a menu as frosted overlay buttons, and
 * title, kind, date and size below.
 */
export const MediaCard = memo(function MediaCard({
  item,
  index = 0,
  onOpen,
  onDownload,
  onShare,
  onDelete,
}: MediaCardProps): JSX.Element {
  const urlOptions = useSharedMediaUrlOptions(item.shareToken);
  const title = mediaTitle(item);

  return (
    <InteractiveCard label={title} onActivate={() => onOpen(item)} className={galleryCard}>
      <div
        className={cn(
          'relative flex aspect-square w-full items-center justify-center overflow-hidden bg-background-alt',
          item.mediaType === 'image' && 'p-[6%] [&_img]:rounded-sm'
        )}
      >
        <MediaPreview item={item} priority={index < 6} sizes={CARD_SIZES} {...urlOptions} />

        <div className={overlayRow}>
          <button
            type="button"
            onClick={() => onDownload(item)}
            className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
            aria-label={`${title} herunterladen`}
            title="Herunterladen"
          >
            <Download className="size-4" aria-hidden />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
                aria-label={`Aktionen für ${title}`}
                title="Aktionen"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onOpen(item)}>
                <Pencil aria-hidden /> Bearbeiten
              </DropdownMenuItem>
              {onShare && (
                <DropdownMenuItem onSelect={() => onShare(item)}>
                  <Share2 aria-hidden /> Teilen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}>
                <Trash2 aria-hidden /> In den Papierkorb
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <h3
          className="truncate text-[0.9375rem] font-semibold text-foreground-heading"
          title={title}
        >
          {title}
        </h3>
        <div className="flex items-center gap-2 text-sm text-grey-600 dark:text-grey-400">
          <Badge variant="outline">{mediaKindLabel(item)}</Badge>
          <span className="truncate">{formatMediaDate(item.createdAt)}</span>
          <span className="ml-auto whitespace-nowrap max-sm:hidden">
            {formatFileSize(item.fileSize)}
          </span>
        </div>
      </div>
    </InteractiveCard>
  );
});
