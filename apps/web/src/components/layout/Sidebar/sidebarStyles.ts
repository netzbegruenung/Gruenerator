import { cn } from '@/utils/cn';

// Rows are 36 px with a 4 px gap (my-0.5) in both states, so nothing jumps
// vertically when the rail expands on hover. Collapsed, a row is a 36 px square.
export const menuLinkClass = (active: boolean, disabled?: boolean, collapsed?: boolean) =>
  cn(
    'group/link flex items-center py-1.5 my-0.5 rounded-md min-h-9 no-underline whitespace-nowrap transition-colors duration-150 text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
    collapsed ? 'mx-2.5 w-9 justify-center px-0 gap-0' : 'mx-2 gap-2.5 px-3',
    // Neutral, not the green tint: the current entry is marked by a plain surface.
    active && 'bg-black/[0.07] dark:bg-white/[0.1] font-medium',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

// Neutral grey in light mode (matches the rest of the sidebar chrome). In dark
// mode the inactive icons are muted and only the hovered or current one is
// white, so the rail reads calmer. Outline icons draw at 1.75 instead of 2.
export const iconClass =
  'text-[1.25rem] text-grey-600 dark:text-grey-400 group-hover/link:dark:text-white group-aria-[current=page]/link:dark:text-white shrink-0 w-5 flex items-center justify-center transition-colors duration-150 [stroke-width:1.75]';

export const headerIconButtonClass =
  'flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]';
