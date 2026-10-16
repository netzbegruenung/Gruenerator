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
import { VorlageComments } from './VorlageComments';

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
  /** Gallery item id the comments hang on; omitted when the Vorlage has no id yet. */
  templateId?: string;
  /** Further sections, set off by a separator. */
  children?: ReactNode;
  /** False for Vorlagen nobody can like or bookmark, rather than showing both as signed out. */
  reactions?: boolean;
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
  templateId,
  children,
  reactions = true,
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
          {reactions && (
            <>
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
                  onToggleFavorite
                    ? favorited
                      ? 'Gemerkt'
                      : 'Merken'
                    : 'Melde dich an, um zu merken'
                }
                disabled={!onToggleFavorite || favoriteToggling}
                className={cn(favorited && 'text-primary-600 dark:text-primary-400')}
                onClick={onToggleFavorite}
              >
                <Bookmark aria-hidden className={ICON} fill={favorited ? 'currentColor' : 'none'} />
              </Button>
            </>
          )}
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
          <div className="flex aspect-[4/5] max-h-[55dvh] items-center justify-center overflow-hidden rounded-2xl bg-background-alt">
            {current ? (
              <img src={current.src} alt={current.alt} className="size-full object-contain" />
            ) : (
              <span className="text-sm text-grey-500">Keine Vorschau verfügbar</span>
            )}
          </div>
          {/* Every page at a glance; choosing one shows it large. */}
          {pages.length > 1 && (
            <div role="group" aria-label="Seiten" className="flex gap-2 overflow-x-auto pb-1">
              {pages.map((p, i) => (
                <button
                  key={p.src}
                  type="button"
                  aria-label={`Seite ${i + 1} von ${pages.length} anzeigen`}
                  aria-current={i === page}
                  onClick={() => setPage(i)}
                  onFocus={() => setPage(i)}
                  className={cn(
                    'h-20 shrink-0 overflow-hidden rounded-lg border-2 bg-background-alt transition-colors',
                    i === page
                      ? 'border-primary-600 dark:border-primary-400'
                      : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
                  )}
                >
                  <img src={p.src} alt="" className="h-full w-auto" />
                </button>
              ))}
            </div>
          )}
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
          {templateId && (
            <>
              <Separator />
              <VorlageComments templateId={templateId} />
            </>
          )}
        </div>
      </DialogContent>
      {share && <ShareVorlageDialog {...share} open={sharing} onOpenChange={setSharing} />}
    </Dialog>
  );
}
