import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Separator,
} from '@gruenerator/ui';
import { Bookmark, Heart, Share2, X } from 'lucide-react';
import { useState, type JSX, type ReactNode } from 'react';

import { type VorlagenCardProps } from '../../../components/common/Gallery/VorlagenCard';

import { ShareVorlageDialog, type VorlageShareTarget } from './ShareVorlageDialog';

import { cn } from '@/utils/cn';

export type VorlageInteractionProps = Pick<
  VorlagenCardProps,
  'liked' | 'onToggleLike' | 'likeToggling' | 'favorited' | 'onToggleFavorite' | 'favoriteToggling'
>;

interface VorlageDetailDialogProps extends VorlageInteractionProps {
  onClose: () => void;
  title: string;
  description?: string;
  /** One line above the title: form or tool, format, date … */
  meta: string;
  /** Every page in order; the pager steps through them. */
  pages: Array<{ src: string; alt: string }>;
  /** Small print under the preview (photo credits, author). */
  credits?: ReactNode;
  /** The one thing to do with this Vorlage. */
  primaryAction?: ReactNode;
  /** Omitted when there is nothing to share: no link, and not the viewer's own. */
  share?: VorlageShareTarget;
  /** Further sections, set off by a separator. */
  children?: ReactNode;
}

const ICON = 'size-[18px]';

/**
 * The one detail view for every Vorlage — Grünerator catalogue, Canva and
 * community alike: preview with pager on the left; meta, title and the primary
 * action on the right; Like, Merken and Teilen as quiet icons next to Close.
 */
export function VorlageDetailDialog({
  onClose,
  title,
  description,
  meta,
  pages,
  credits,
  primaryAction,
  share,
  children,
  liked = false,
  onToggleLike,
  likeToggling = false,
  favorited = false,
  onToggleFavorite,
  favoriteToggling = false,
}: VorlageDetailDialogProps): JSX.Element {
  const [page, setPage] = useState(0);
  const current = pages[page] ?? pages[0];

  const [sharing, setSharing] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        {...(!description && { 'aria-describedby': undefined })}
        className={cn(
          'max-h-[90dvh] gap-8 rounded-[20px] p-8 pt-16 max-sm:gap-6 max-sm:p-5 max-sm:pt-16 sm:max-w-[1000px] md:pt-8',
          'grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]'
        )}
      >
        <div className="absolute top-4 right-4 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Liken"
            aria-pressed={liked}
            title={onToggleLike ? 'Liken' : 'Melde dich an, um zu liken'}
            disabled={!onToggleLike || likeToggling}
            className={cn(liked && 'text-red-600 dark:text-red-400')}
            onClick={onToggleLike}
          >
            <Heart aria-hidden className={ICON} fill={liked ? 'currentColor' : 'none'} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Merken"
            aria-pressed={favorited}
            title={
              onToggleFavorite ? (favorited ? 'Gemerkt' : 'Merken') : 'Melde dich an, um zu merken'
            }
            disabled={!onToggleFavorite || favoriteToggling}
            className={cn(favorited && 'text-primary-600 dark:text-primary-400')}
            onClick={onToggleFavorite}
          >
            <Bookmark aria-hidden className={ICON} fill={favorited ? 'currentColor' : 'none'} />
          </Button>
          {share && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Teilen"
              title="Teilen"
              onClick={() => setSharing(true)}
            >
              <Share2 aria-hidden className={ICON} />
            </Button>
          )}
          <div aria-hidden className="mx-2 h-5 w-px bg-grey-200 dark:bg-grey-700" />
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Schließen">
              <X aria-hidden className="size-5" />
            </Button>
          </DialogClose>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl bg-background-alt">
            {current ? (
              <img src={current.src} alt={current.alt} className="size-full object-contain" />
            ) : (
              <span className="text-sm text-grey-500">Keine Vorschau verfügbar</span>
            )}
            {pages.length > 1 && (
              <button
                type="button"
                onClick={() => setPage((page + 1) % pages.length)}
                aria-label={`Nächste Seite, gerade Seite ${page + 1} von ${pages.length}`}
                className="absolute right-3.5 bottom-3.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] text-[#1c2b24] transition-colors hover:bg-white"
              >
                {page + 1} / {pages.length} →
              </button>
            )}
          </div>
          {credits}
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:pt-2">
          <span className="text-sm text-grey-600 dark:text-grey-400">{meta}</span>
          <DialogTitle className="m-0 text-[28px] leading-tight font-bold text-foreground-heading">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="m-0 mb-2 text-base text-grey-600 dark:text-grey-400">
              {description}
            </DialogDescription>
          )}
          {primaryAction}
          {children && (
            <>
              <Separator />
              {children}
            </>
          )}
        </div>
      </DialogContent>
      {share && <ShareVorlageDialog {...share} open={sharing} onOpenChange={setSharing} />}
    </Dialog>
  );
}
