import { Badge } from '@gruenerator/ui';
import { memo, type JSX, type ReactNode } from 'react';
import {
  HiHeart,
  HiOutlineExternalLink,
  HiOutlineHeart,
  HiOutlineLink,
  HiOutlinePhotograph,
} from 'react-icons/hi';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';
import { SiCanva } from 'react-icons/si';

import { getTemplateFormat } from './templateFormat';

import { cn } from '@/utils/cn';

interface VorlagenCardItem {
  id: string | number;
  title?: string;
  template_type?: string;
  tags?: string[];
  thumbnail_url?: string;
  external_url?: string | null;
  download_url?: string;
  content_data?: { originalUrl?: string } | Record<string, unknown>;
  likes_count?: number;
}

export interface VorlagenCardProps {
  item: VorlagenCardItem;
  /** Top-right overlay marker (e.g. "Community"). */
  badge?: ReactNode;
  /** Top-right overlay actions menu (e.g. the 3-dot dropdown on "Meine Vorlagen"). */
  menu?: ReactNode;
  onOpen: () => void;
  /** Opens the external/source URL directly (hover action). Omitted when none exists. */
  onOpenExternal?: () => void;
  /** Copies a shareable link to the clipboard (hover action). */
  onCopyLink?: () => void;
  /** Whether the current user has liked this template. */
  liked?: boolean;
  /** Toggles the like (hover action). Rendered only when provided. */
  onToggleLike?: () => void;
  /** Disables the like button while a toggle is in flight. */
  likeToggling?: boolean;
}

const ToolIcon = ({ tool }: { tool: ReturnType<typeof getTemplateFormat>['tool'] }) => {
  if (tool === 'Canva') return <SiCanva className="size-3.5 shrink-0" aria-hidden="true" />;
  if (tool === 'Download')
    return <HiOutlineArrowDownTray className="size-3.5 shrink-0" aria-hidden="true" />;
  return <HiOutlineLink className="size-3.5 shrink-0" aria-hidden="true" />;
};

/**
 * Gallery card for the Vorlagen-Datenbank. Unlike the generic IndexCard it
 * renders each template's real format proportioned on a uniform neutral
 * "stage" (no dead grey margins), badges the format, and exposes a compact
 * meta row plus hover actions.
 */
const VorlagenCard = memo(
  ({
    item,
    badge,
    menu,
    onOpen,
    onOpenExternal,
    onCopyLink,
    liked = false,
    onToggleLike,
    likeToggling = false,
  }: VorlagenCardProps): JSX.Element => {
    const format = getTemplateFormat(item);
    const title = item.title || 'Unbenannte Vorlage';
    const likesCount = typeof item.likes_count === 'number' ? item.likes_count : 0;

    // The stage is a 4:5 box. Fit the proportioned template inside *both* axes
    // (contain, never crop): wide formats (e.g. 16:9, 3:1) are constrained by
    // width, tall/square ones by height. Pinning only the height clipped wide
    // templates horizontally.
    const STAGE_RATIO = 4 / 5;
    const [ratioW, ratioH] = format.aspectRatio.split('/').map((n) => parseFloat(n));
    const isWiderThanStage = ratioW / ratioH > STAGE_RATIO;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    };

    const stop = (e: React.MouseEvent) => e.stopPropagation();

    return (
      <div
        className={cn(
          'group flex flex-col overflow-hidden rounded-lg border border-grey-200 bg-background text-left',
          'shadow-card-subtle transition-all duration-200 dark:border-grey-700',
          'cursor-pointer hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500'
        )}
        onClick={onOpen}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Vorlage ${title} öffnen`}
      >
        {/* Neutral stage — the real format sits centered and proportioned. */}
        <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-background-alt p-3">
          <div
            className="flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-sm bg-background shadow-sm ring-1 ring-black/5"
            style={{
              aspectRatio: format.aspectRatio,
              // Constrain the dominant axis so the template always fits the stage
              // fully (contain, never crop): width for landscape formats, height
              // for portrait/square. Pinning height alone clipped wide formats.
              ...(isWiderThanStage ? { width: '100%' } : { height: '100%' }),
            }}
          >
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt={title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <HiOutlinePhotograph className="size-8 text-grey-400" aria-hidden="true" />
            )}
          </div>

          <Badge
            variant="secondary"
            className="absolute left-2 top-2 bg-background/90 text-foreground shadow-sm backdrop-blur-sm"
          >
            {format.typeLabel}
          </Badge>
          {(badge != null || menu != null) && (
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              {badge}
              {menu}
            </div>
          )}

          {(onToggleLike || onOpenExternal || onCopyLink) && (
            <div
              className={cn(
                'absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 p-2',
                'translate-y-1 opacity-0 transition-all duration-200',
                'group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100',
                // Keep the bar (filled heart) visible so a like reads at a glance.
                liked && 'translate-y-0 opacity-100'
              )}
            >
              {onToggleLike && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onToggleLike();
                  }}
                  disabled={likeToggling}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full bg-background/95 shadow-sm transition-colors hover:bg-red-500 hover:text-white disabled:opacity-60',
                    liked ? 'text-red-500' : 'text-foreground'
                  )}
                  aria-label={liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
                  aria-pressed={liked}
                  title={liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
                >
                  {liked ? (
                    <HiHeart className="size-4" aria-hidden="true" />
                  ) : (
                    <HiOutlineHeart className="size-4" aria-hidden="true" />
                  )}
                </button>
              )}
              {onOpenExternal && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onOpenExternal();
                  }}
                  className="flex size-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm transition-colors hover:bg-primary-500 hover:text-white"
                  aria-label="Vorlage öffnen"
                  title="Öffnen"
                >
                  <HiOutlineExternalLink className="size-4" />
                </button>
              )}
              {onCopyLink && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onCopyLink();
                  }}
                  className="flex size-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm transition-colors hover:bg-primary-500 hover:text-white"
                  aria-label="Link kopieren"
                  title="Link kopieren"
                >
                  <HiOutlineLink className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Meta row: name + tool + format label. */}
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <h3 className="truncate text-sm font-semibold text-foreground-heading" title={title}>
            {title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-grey-600 dark:text-grey-400">
            <ToolIcon tool={format.tool} />
            <span>{format.tool}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium">{format.ratioLabel}</span>
            {likesCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1 font-medium"
                title={`${likesCount} mal geliked`}
              >
                <HiOutlineHeart className="size-3.5 shrink-0" aria-hidden="true" />
                {likesCount}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

VorlagenCard.displayName = 'VorlagenCard';

export default VorlagenCard;
