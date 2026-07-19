import { cn } from '@gruenerator/ui';
import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { FiFolder, FiLayers } from 'react-icons/fi';

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
    menu,
    action,
    accent,
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

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    };

    // Cover tiles are just the branded 1:1 image (its title is baked in) — no
    // footer; the menu floats over the image. Icon tiles keep the title/meta footer.
    if (coverImage) {
      return (
        <div
          role="button"
          tabIndex={0}
          aria-label={title}
          onClick={onActivate}
          onKeyDown={handleKeyDown}
          className={rootClass}
        >
          <div className="aspect-square overflow-hidden bg-grey-50 dark:bg-grey-800/40">
            <img
              src={coverImage}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
          {(action || menu) && (
            <div className="absolute right-2 top-2 flex items-center gap-1">
              {action && (
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {action}
                </div>
              )}
              {menu && (
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
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={handleKeyDown}
        className={rootClass}
      >
        <div className="flex aspect-[5/4] items-center justify-center bg-grey-50 dark:bg-grey-800/40">
          <Icon className="size-9 text-grey-400 dark:text-grey-500" />
        </div>

        <div className="flex items-start gap-2 border-t border-grey-100 px-3 py-2.5 dark:border-grey-700/60">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="m-0 min-w-0 truncate text-sm font-medium text-foreground-heading">
              {title}
            </h3>
            {meta && (
              <p className="m-0 flex min-w-0 items-center gap-1 truncate text-xs text-grey-500 dark:text-grey-400">
                <MetaIcon className="size-3 shrink-0" />
                <span className="truncate">{meta}</span>
              </p>
            )}
          </div>
          {action && (
            <div
              className="-mr-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {action}
            </div>
          )}
          {menu && (
            <div
              className="-mr-1 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
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
