import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InteractiveCard,
} from '@gruenerator/ui';
import { ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { memo, type JSX } from 'react';

import { galleryCard, overlayAction, overlayRow } from '../../../components/common/Gallery/parts';
import { resolveApiAssetUrl, shareThumbnailPreviewUrl } from '../../../utils/platform';
import { formatMediaDate } from '../mediaFormat';

import type { MediathekEntry } from '../hooks/useMediathek';

import { cn } from '@/utils/cn';

type LinkedEntry = Exclude<MediathekEntry, { kind: 'media' }>;

export interface LinkedEntryCardProps {
  entry: LinkedEntry;
  onOpen: (entry: LinkedEntry) => void;
  onDelete: (entry: LinkedEntry) => void;
}

/**
 * A Reel or an editable canvas Sharepic in the Mediathek: same card as a media
 * file, but it opens its editor instead of the detail dialog — there is no file
 * behind it to download or describe.
 */
export const LinkedEntryCard = memo(function LinkedEntryCard({
  entry,
  onOpen,
  onDelete,
}: LinkedEntryCardProps): JSX.Element {
  const thumbnail =
    entry.kind === 'canvas'
      ? resolveApiAssetUrl(shareThumbnailPreviewUrl(entry.thumbnailUrl ?? undefined))
      : resolveApiAssetUrl(entry.thumbnailUrl ?? undefined);

  return (
    <InteractiveCard label={entry.title} onActivate={() => onOpen(entry)} className={galleryCard}>
      <div
        className={cn(
          'relative flex aspect-square w-full items-center justify-center overflow-hidden bg-background-alt',
          entry.kind === 'canvas' && 'p-[6%] [&_img]:rounded-sm'
        )}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="select-none text-4xl" aria-hidden>
            {entry.kind === 'video' ? '🎬' : '🖼'}
          </span>
        )}

        <div className={overlayRow}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
                aria-label={`Aktionen für ${entry.title}`}
                title="Aktionen"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onOpen(entry)}>
                <ExternalLink aria-hidden /> Im Editor öffnen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(entry)}>
                <Trash2 aria-hidden /> In den Papierkorb
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <h3
          className="truncate text-[0.9375rem] font-semibold text-foreground-heading"
          title={entry.title}
        >
          {entry.title}
        </h3>
        <div className="flex items-center gap-2 text-sm text-grey-600 dark:text-grey-400">
          <Badge variant="outline">{entry.kind === 'video' ? 'Reel' : 'Sharepic'}</Badge>
          <span className="truncate">{formatMediaDate(entry.date)}</span>
        </div>
      </div>
    </InteractiveCard>
  );
});
