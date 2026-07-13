import { HIDDEN_SCROLLBAR } from '../../sidebarStyles';

import { cn } from '../../../utils/cn';

export interface JumpBarItem {
  id: string;
  label: string;
}

export function CategoryJumpBar({
  items,
  activeId,
  onSelect,
}: {
  items: JumpBarItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={cn('flex flex-none gap-1.5 px-3 pb-1 overflow-x-auto', HIDDEN_SCROLLBAR)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'h-7 px-3 flex-none inline-flex items-center rounded-full border-none cursor-pointer whitespace-nowrap',
            'text-[11.5px] transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-600/50',
            item.id === activeId
              ? 'bg-secondary-600 text-white font-bold dark:bg-secondary-300 dark:text-grey-900'
              : 'bg-transparent font-semibold text-[var(--editor-text-muted)] hover:bg-[var(--editor-tile)] hover:text-[var(--editor-text)]'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
