import { memo, type CSSProperties, type DragEvent } from 'react';
import { FaCheck } from 'react-icons/fa';

import { cn } from '../../../utils/cn';
import { onThumbnailHover } from '../../../utils/illustrations/svgCache';
import { takeDropPlaced } from '../../../utils/mediaDrop';

import { ElementThumb, thumbFillsTile, thumbNeedsDarkTile } from './ElementThumb';
import { dragDataFor, type ElementItem } from './elementTypes';
import { useRecentElements } from './useRecentElements';

/**
 * - `grid`: category and search grids, label under the tile.
 * - `recent`: the 88px carousel tiles.
 * - `brand`: the "Eure Marke" row, a card with a border and a springier hover.
 */
export type ElementTileVariant = 'grid' | 'recent' | 'brand';

const INNER: Record<ElementTileVariant, string> = {
  grid: 'size-[74%] duration-200 ease-out',
  recent: 'size-[72%] duration-200 ease-out',
  brand: 'size-[66%] duration-[450ms] ease-[cubic-bezier(.3,1.5,.5,1)]',
};

interface ElementTileProps {
  item: ElementItem;
  variant: ElementTileVariant;
  onActivate: (item: ElementItem) => void;
  /** Position in the entrance stagger; null when the tile mounts after it. */
  enterIndex: number | null;
  /** Mouse drag onto a page; off on touch layouts, where HTML5 DnD does not fire. */
  canDrag: boolean;
  selected?: boolean;
  disabled?: boolean;
  eager?: boolean;
}

/**
 * Makes a button drag `item` onto a page, previewed by its `[data-tile-face]`
 * or else its image. A drop the page accepted counts like a click for
 * "Zuletzt verwendet".
 */
export function elementDragProps(item: ElementItem) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      takeDropPlaced();
      const drag = dragDataFor(item.action);
      e.dataTransfer.setData(drag.type, drag.data);
      e.dataTransfer.effectAllowed = 'copy';
      const preview =
        e.currentTarget.querySelector<HTMLElement>('[data-tile-face]') ??
        e.currentTarget.querySelector<HTMLElement>('img');
      if (preview)
        e.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);
    },
    onDragEnd: () => {
      if (takeDropPlaced()) useRecentElements.getState().remember(item);
    },
  };
}

export const ElementTile = memo(function ElementTile({
  item,
  variant,
  onActivate,
  enterIndex,
  canDrag,
  selected = false,
  disabled = false,
  eager = false,
}: ElementTileProps) {
  const fills = thumbFillsTile(item.thumb);
  const dark = thumbNeedsDarkTile(item.thumb);
  // `selected`/`disabled` describe the active page; a drag can target another
  // page, whose canvas decides on the drop. Hence `aria-disabled`: a disabled
  // button starts no drag.
  const draggable = canDrag;
  const svgDef = item.thumb.t === 'svg' ? item.thumb.def : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 min-w-0',
        variant === 'recent' && 'w-[88px] flex-none',
        enterIndex !== null && 'element-enter'
      )}
      {...(enterIndex !== null
        ? { style: { '--i': Math.min(enterIndex, 8) } as CSSProperties }
        : {})}
    >
      <button
        type="button"
        title={item.label}
        aria-label={`${item.label} hinzufügen`}
        {...(item.action.kind === 'icon' ? { 'aria-pressed': selected } : {})}
        aria-disabled={disabled}
        {...(draggable ? elementDragProps(item) : { draggable: false })}
        onClick={() => {
          if (!disabled) onActivate(item);
        }}
        {...(svgDef ? { onPointerEnter: () => onThumbnailHover(svgDef.id, svgDef) } : {})}
        className={cn(
          'group/tile relative grid place-items-center w-full rounded-xl p-0 border cursor-pointer',
          'transition-[background-color,border-color] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
          variant === 'recent' ? 'size-[88px]' : 'aspect-square',
          fills && 'overflow-hidden',
          dark
            ? 'bg-secondary-600 hover:bg-secondary-700 border-transparent'
            : variant === 'brand'
              ? 'bg-[var(--editor-surface)] border-[var(--editor-border-soft)] hover:bg-[var(--editor-tile)]'
              : 'bg-transparent border-transparent hover:bg-[var(--editor-tile)]',
          selected && 'border-[var(--editor-accent)] bg-[var(--editor-active-soft)]',
          disabled && 'opacity-40 cursor-not-allowed',
          draggable && 'active:cursor-grabbing'
        )}
      >
        <span
          data-tile-face
          className={cn(
            'relative grid place-items-center',
            fills ? 'absolute inset-0' : INNER[variant],
            'transition-transform group-hover/tile:scale-[1.04] group-aria-disabled/tile:scale-100',
            'motion-reduce:transition-none'
          )}
        >
          <ElementThumb thumb={item.thumb} eager={eager} />
        </span>
        {selected && (
          <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-[var(--editor-active-fg)] text-[var(--editor-surface)] grid place-items-center">
            <FaCheck size={8} />
          </span>
        )}
      </button>
      {variant === 'grid' && (
        <span className="text-xs text-[var(--editor-text-muted)] text-center truncate">
          {item.label}
        </span>
      )}
    </div>
  );
});
