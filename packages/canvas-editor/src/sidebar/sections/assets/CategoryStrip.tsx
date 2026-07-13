import { PiCaretRightBold } from 'react-icons/pi';

import { HIDDEN_SCROLLBAR, SELECTABLE_CARD_DISABLED } from '../../sidebarStyles';

import type { ReactNode } from 'react';

import { cn } from '../../../utils/cn';

export function CategoryStrip({
  id,
  title,
  onShowMore,
  children,
}: {
  id: string;
  title: string;
  onShowMore?: () => void;
  children: ReactNode;
}) {
  return (
    <section data-strip-id={id} className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-[18px] pt-3.5 pb-2">
        <h4 className="m-0 text-[13.5px] font-bold text-[var(--editor-text)]">{title}</h4>
        {onShowMore && (
          <button
            type="button"
            onClick={onShowMore}
            className="inline-flex items-center gap-0.5 bg-transparent border-none p-0 rounded text-xs font-bold text-secondary-600 dark:text-secondary-300 cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-600/50"
          >
            Mehr anzeigen
            <PiCaretRightBold size={11} />
          </button>
        )}
      </div>
      <div className={cn('flex gap-2 px-[18px] pb-1.5 overflow-x-auto', HIDDEN_SCROLLBAR)}>
        {children}
      </div>
    </section>
  );
}

export function StripTile({
  title,
  onClick,
  disabled = false,
  selected = false,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative w-[78px] h-[60px] flex-none rounded-[10px] bg-transparent border border-transparent cursor-pointer',
        'flex items-center justify-center transition-[background-color,border-color] duration-150',
        'hover:bg-[var(--editor-tile)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-600/50',
        selected && 'border-[var(--editor-accent)] bg-[var(--editor-active-soft)]',
        disabled && SELECTABLE_CARD_DISABLED,
        className
      )}
    >
      {children}
    </button>
  );
}
