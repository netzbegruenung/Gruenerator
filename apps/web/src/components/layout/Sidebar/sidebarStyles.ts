import { cn } from '@/utils/cn';

export const menuLinkClass = (active: boolean, disabled?: boolean, collapsed?: boolean) =>
  cn(
    'group/link flex items-center py-1.5 mx-2 rounded-md min-h-[34px] no-underline whitespace-nowrap transition-colors duration-150 text-foreground hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
    collapsed ? 'justify-center px-0 gap-0' : 'gap-2.5 px-3',
    active && 'bg-secondary-100 dark:bg-secondary-800/60 font-medium',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

// Eucalyptus (secondary-600) in light mode; white in dark mode for legibility against the dark sidebar.
export const iconClass =
  'text-[1.25rem] text-secondary-600 dark:text-white shrink-0 w-5 flex items-center justify-center transition-colors duration-150';
