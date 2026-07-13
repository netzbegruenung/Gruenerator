import { cn } from '@gruenerator/ui';
import { memo, type ReactNode } from 'react';
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
    menu,
    action,
    accent,
    className,
  }: NotebookGalleryCardProps) => {
    const Icon = icon ?? FiFolder;
    const MetaIcon = metaIcon ?? FiLayers;
    const pink = accent === 'pink';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-xl border bg-background text-left no-underline',
          'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
          pink
            ? 'border-[#EFC9DD] hover:border-[#D6006E] dark:border-[#4A2A3B] dark:hover:border-[#EC5AA0]'
            : 'border-grey-200/80 hover:border-secondary-300 dark:border-grey-700/60 dark:hover:border-secondary-700',
          className
        )}
      >
        <div className="flex aspect-[5/4] items-center justify-center bg-grey-50 dark:bg-grey-800/40">
          <Icon
            className={cn(
              'size-9',
              pink ? 'text-[#D6006E] dark:text-[#EC5AA0]' : 'text-grey-400 dark:text-grey-500'
            )}
          />
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
