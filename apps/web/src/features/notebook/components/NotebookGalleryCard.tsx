import { type NotebookIndexingState } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { memo, type ReactNode } from 'react';
import { FiFolder, FiLayers } from 'react-icons/fi';

import NotebookIndexingBadge from './NotebookIndexingBadge';

import type { IconType } from 'react-icons';

export interface NotebookGalleryCardProps {
  title: string;
  /** Sub-line, e.g. "3 Programme", "542 Artikel", "Eigenes Notebook". */
  meta?: string;
  icon?: IconType;
  /** Small icon shown before `meta`. Defaults to a "layers" (sources) glyph. */
  metaIcon?: IconType;
  onActivate: () => void;
  /**
   * Branded 1:1 cover for the preview zone (a public path, lazy-loaded). When set,
   * the preview is `aspect-square` so the full designed cover shows without
   * cropping its text; cards without a cover keep the ghost-icon `aspect-[5/4]`.
   */
  coverImage?: string;
  /**
   * Rendered cover for notebooks that have no designed webp (user notebooks —
   * see NotebookCoverArt). Takes the same cover-only layout as `coverImage`:
   * the art carries the title, so there is no footer.
   */
  coverNode?: ReactNode;
  /**
   * Footer actions (a menu trigger). Rendered hover-revealed in the footer; the
   * card stops click propagation around it, so the node only needs to render its
   * own trigger/menu — it won't navigate the card.
   */
  menu?: ReactNode;
  /**
   * Always-visible footer action (e.g. a like button whose count must stay
   * readable). Unlike `menu` it is not hover-revealed. The card stops click
   * propagation around it, so the node won't navigate the card.
   */
  action?: ReactNode;
  /** Pink icon + border accent for the "Wissen" notebook surface. Defaults to neutral. */
  accent?: 'pink';
  /**
   * Readiness of the notebook's sources. Renders a badge over the preview for
   * anything but `ready`/`empty`, so a notebook that cannot answer yet no longer
   * looks exactly like one that can. Omitted for system notebooks.
   */
  indexingState?: NotebookIndexingState | null;
  className?: string;
}

/**
 * The shared notebook card: a neutral `aspect-[5/4]` preview zone with a ghost
 * icon (no fill/colour) over a footer of title + meta. Mirrors the Zuletzt
 * activity cards so notebooks read as one system across the workplace and the
 * /notebooks gallery.
 */
const NotebookGalleryCard = memo(
  ({
    title,
    meta,
    icon,
    metaIcon,
    onActivate,
    coverImage,
    coverNode,
    menu,
    action,
    accent,
    indexingState,
    className,
  }: NotebookGalleryCardProps) => {
    const Icon = icon ?? FiFolder;
    const MetaIcon = metaIcon ?? FiLayers;
    const pink = accent === 'pink';

    const rootClass = cn(
      'group relative flex flex-col overflow-hidden rounded-xl border bg-background text-left no-underline',
      'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
      pink
        ? 'border-[#EFC9DD] hover:border-[#D6006E] dark:border-[#4A2A3B] dark:hover:border-[#EC5AA0]'
        : 'border-grey-200/80 hover:border-secondary-300 dark:border-grey-700/60 dark:hover:border-secondary-700',
      className
    );

    // Cover tiles are just the branded 1:1 art (its title is baked in, whether
    // as a designed webp or rendered by NotebookCoverArt) — no footer; the menu
    // floats over it. Icon tiles keep the title/meta footer.
    if (coverImage || coverNode) {
      return (
        <div className={rootClass}>
          {/* One stretched-button tab stop activates the card; the menu/action
              controls (z-20) stay reachable as their own siblings.

              Das z-10 ist gemessen, nicht dekorativ: `coverNode` (NotebookCoverArt)
              ist selbst `position: relative` und landet damit in derselben
              Mal-Ebene wie ein `z-0`-Knopf — in Baumreihenfolge DAHINTER, also
              darüber. Der Klick auf die Karte traf dann das Cover statt den
              Knopf und tat nichts (Landesverbände mit `coverImage` blieben heil,
              weil ein nicht positioniertes <img> eine Ebene tiefer malt).
              jsdom hat kein Layout — eine RTL-Zusicherung sieht das nie. */}
          <button
            type="button"
            aria-label={title}
            onClick={onActivate}
            className="absolute inset-0 z-10 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600"
          />
          <div className="aspect-square overflow-hidden bg-grey-50 dark:bg-grey-800/40">
            {coverImage ? (
              <img
                src={coverImage}
                alt={title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              coverNode
            )}
          </div>
          {/* Left of the action pills so a long badge never collides with them. */}
          <div className="pointer-events-none absolute left-2 top-2 z-20">
            <NotebookIndexingBadge state={indexingState} />
          </div>
          {(action || menu) && (
            <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
              {action && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- fängt nur den Klick/Tastendruck ab, damit er nicht die Karte aktiviert
                <div
                  // Same pill as the menu below, but never hidden: the action's
                  // own colours (grey icon, red when liked) are built for a light
                  // card, and sit unreadable directly on the pink cover.
                  className="rounded-full bg-white/85 backdrop-blur-sm dark:bg-black/50"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {action}
                </div>
              )}
              {menu && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- fängt nur den Klick/Tastendruck ab, damit er nicht die Karte aktiviert
                <div
                  className="rounded-full bg-white/85 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 dark:bg-black/50"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {menu}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={rootClass}>
        <div className="relative flex aspect-[5/4] items-center justify-center bg-grey-50 dark:bg-grey-800/40">
          <Icon className="size-9 text-grey-400 dark:text-grey-500" />
          <div className="pointer-events-none absolute left-2 top-2 z-20">
            <NotebookIndexingBadge state={indexingState} />
          </div>
        </div>

        <div className="flex items-start gap-2 border-t border-grey-100 px-3 py-2.5 dark:border-grey-700/60">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="m-0 min-w-0 truncate text-sm font-medium text-foreground-heading">
              {/* Stretched title button: whole card is one tab stop; the footer
                  action/menu stay their own controls above the overlay. */}
              <button
                type="button"
                onClick={onActivate}
                title={title}
                className="block w-full truncate text-left outline-none after:absolute after:inset-0 after:content-[''] after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary-600"
              >
                {title}
              </button>
            </h3>
            {meta && (
              <p className="m-0 flex min-w-0 items-center gap-1 truncate text-xs text-grey-500 dark:text-grey-400">
                <MetaIcon className="size-3 shrink-0" />
                <span className="truncate">{meta}</span>
              </p>
            )}
          </div>
          {action && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- fängt nur den Klick/Tastendruck ab, damit er nicht die Karte aktiviert
            <div
              className="relative z-10 -mr-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {action}
            </div>
          )}
          {menu && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- fängt nur den Klick/Tastendruck ab, damit er nicht die Karte aktiviert
            <div
              className="relative z-10 -mr-1 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {menu}
            </div>
          )}
        </div>
      </div>
    );
  }
);

NotebookGalleryCard.displayName = 'NotebookGalleryCard';

export default NotebookGalleryCard;
