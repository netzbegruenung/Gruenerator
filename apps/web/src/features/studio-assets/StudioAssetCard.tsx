import { type StudioAssetItem } from '@gruenerator/contracts';
import { STUDIO_ASSET_MODERATION_BADGE } from '@gruenerator/shared/studio-assets';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gruenerator/ui';
import {
  Bookmark,
  Flag,
  Globe,
  Heart,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserCircle,
} from 'lucide-react';
import { memo, type JSX } from 'react';

import { galleryCard, overlayAction, overlayRow } from '../../components/common/Gallery/parts';

import { cn } from '@/utils/cn';

// Transparent stickers sit on a checkerboard so their cut edge stays visible.
const CHECKERBOARD =
  'bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] ' +
  'dark:bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1f1f1f_0%_50%)]';

export interface StudioAssetCardProps {
  item: StudioAssetItem;
  onToggleLike: (item: StudioAssetItem) => void;
  onToggleFavorite: (item: StudioAssetItem) => void;
  onUseInProfilbild: (item: StudioAssetItem) => void;
  onReport: (item: StudioAssetItem) => void;
  onPublish: (item: StudioAssetItem) => void;
  onMakePrivate: (item: StudioAssetItem) => void;
  onRename: (item: StudioAssetItem) => void;
  onDelete: (item: StudioAssetItem) => void;
}

export const StudioAssetCard = memo(function StudioAssetCard({
  item,
  onToggleLike,
  onToggleFavorite,
  onUseInProfilbild,
  onReport,
  onPublish,
  onMakePrivate,
  onRename,
  onDelete,
}: StudioAssetCardProps): JSX.Element {
  const isSticker = item.kind === 'sticker';
  const moderation =
    item.isOwn && item.moderation !== 'ok' ? STUDIO_ASSET_MODERATION_BADGE[item.moderation] : null;

  return (
    <article className={cn(galleryCard, 'cursor-default')} aria-label={item.title}>
      <div
        className={cn(
          'relative flex aspect-square w-full items-center justify-center overflow-hidden',
          isSticker ? cn(CHECKERBOARD, 'p-[10%]') : 'bg-background-alt'
        )}
      >
        <img
          src={item.thumbUrl ?? item.src}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            'max-h-full max-w-full',
            isSticker ? 'object-contain' : 'size-full object-cover'
          )}
        />

        <div className={overlayRow}>
          <button
            type="button"
            onClick={() => onToggleLike(item)}
            className={cn(overlayAction, 'w-auto gap-1 px-2.5 hover:bg-[#0f1210]/85')}
            aria-label={`Gefällt mir (${item.likesCount})`}
            aria-pressed={item.liked}
            title="Gefällt mir"
          >
            <Heart
              className={cn('size-4', item.liked && 'fill-primary-500 text-primary-500')}
              aria-hidden
            />
            <span className="text-xs font-semibold tabular-nums" aria-hidden>
              {item.likesCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFavorite(item)}
            className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
            aria-label="Merken"
            aria-pressed={item.favorited}
            title={item.favorited ? 'Gemerkt' : 'Merken'}
          >
            <Bookmark className={cn('size-4', item.favorited && 'fill-white')} aria-hidden />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
                aria-label={`Aktionen für ${item.title}`}
                title="Aktionen"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onUseInProfilbild(item)}>
                <UserCircle aria-hidden /> Im Profilbild verwenden
              </DropdownMenuItem>
              {item.isOwn ? (
                <>
                  {item.visibility === 'public' ? (
                    <DropdownMenuItem onSelect={() => onMakePrivate(item)}>
                      <Lock aria-hidden /> Privat machen
                    </DropdownMenuItem>
                  ) : (
                    item.moderation !== 'removed' && (
                      <DropdownMenuItem onSelect={() => onPublish(item)}>
                        <Globe aria-hidden /> Öffentlich machen
                      </DropdownMenuItem>
                    )
                  )}
                  <DropdownMenuItem onSelect={() => onRename(item)}>
                    <Pencil aria-hidden /> Umbenennen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}>
                    <Trash2 aria-hidden /> Löschen
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onReport(item)}>
                    <Flag aria-hidden /> Melden
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-4 pt-3 pb-3.5">
        <h3
          className="truncate text-[0.9375rem] font-semibold text-foreground-heading"
          title={item.title}
        >
          {item.title}
        </h3>
        <div className="flex min-w-0 items-center gap-2 text-sm text-grey-600 dark:text-grey-400">
          <span className="truncate">
            {item.isOwn ? 'Von dir' : (item.authorName ?? 'Unbekannt')}
          </span>
          {item.isOwn && (
            <Badge variant="outline" className="ml-auto shrink-0">
              {item.visibility === 'public' ? 'Öffentlich' : 'Privat'}
            </Badge>
          )}
          {moderation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tooltip-Auslöser muss per Tastatur erreichbar sein
                  tabIndex={0}
                  className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <Badge variant="destructive">{moderation.label}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{moderation.hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </article>
  );
});
