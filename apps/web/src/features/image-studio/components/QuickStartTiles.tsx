import { ArrowRight, Image as ImageIcon, Sparkles, Video, type LucideIcon } from 'lucide-react';

import { SHOW_SHAREPIC_STUDIO } from '../../../config/featureFlags';
import { cn } from '../../../utils/cn';

export type QuickStart = {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
};

/** Actions each quick-start tile triggers. The Sharepic tile's AT-vs-DE routing
 * and SHOW_SHAREPIC_STUDIO gating are handled centrally by {@link buildStudioQuickStarts};
 * callers only supply the DE canvas-creation handler. */
export type StudioQuickStartHandlers = {
  isAustrianUser: boolean;
  /** DE Sharepic creation (canvas flow). Ignored for AT and when the studio is gated off. */
  onSharepic: () => void;
  onKiBild: () => void;
  onReel: () => void;
};

const SHAREPIC_DESCRIPTION = 'Zitate, Headlines & Infos aus Vorlagen.';

/**
 * Builds the standard Studio quick-start tiles (Sharepic / KI-Bild / Reel) with
 * consistent audience and feature-flag handling so every empty state stays in
 * sync. AT is a first-class audience: Austrian users get the external Sharepic
 * generator. For DE the Sharepic tile is omitted when the canvas creator is
 * gated off (SHOW_SHAREPIC_STUDIO), matching the Sharepics section which then
 * exposes no create entry either.
 */
export function buildStudioQuickStarts({
  onSharepic,
  onKiBild,
  onReel,
}: StudioQuickStartHandlers): QuickStart[] {
  // AT and DE both use the internal canvas studio now (AT gets the de-AT
  // template set via audience filtering); no external bildgenerator redirect.
  const sharepic: QuickStart | null = SHOW_SHAREPIC_STUDIO
    ? {
        key: 'sharepic',
        icon: ImageIcon,
        title: 'Sharepic',
        description: SHAREPIC_DESCRIPTION,
        onClick: onSharepic,
      }
    : null;

  return [
    ...(sharepic ? [sharepic] : []),
    {
      key: 'ki',
      icon: Sparkles,
      title: 'KI-Bild',
      description: 'Bilder per Prompt generieren.',
      onClick: onKiBild,
    },
    {
      key: 'reel',
      icon: Video,
      title: 'Reel',
      description: 'Kurze Videos für Social Media.',
      onClick: onReel,
    },
  ];
}

/**
 * Presentational grid of quick-start tiles. Shared by the Studio landing empty
 * state and the "Meine Bilder" gallery empty state. The grid widens to a third
 * column only when a third tile is present. Keyboard-accessible and
 * reduced-motion aware.
 */
export function QuickStartTiles({ items, className }: { items: QuickStart[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-4 text-left sm:grid-cols-2',
        items.length > 2 && 'md:grid-cols-3',
        className
      )}
    >
      {items.map(({ key, icon: Icon, title, description, onClick }) => (
        <div
          key={key}
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }}
          className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-grey-200 bg-background p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-grey-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-grey-700 dark:hover:border-grey-600"
        >
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary-100 text-primary-600 transition-colors group-hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-200">
            <Icon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-base font-semibold text-foreground-heading">
              {title}
              <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none" />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground opacity-70">{description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
