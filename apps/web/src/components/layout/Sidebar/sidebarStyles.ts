import { cn } from '@/utils/cn';

export const menuLinkClass = (active: boolean, disabled?: boolean) =>
  cn(
    'group/link flex items-center gap-3 py-2 px-3 mx-2 rounded-md min-h-[40px] no-underline whitespace-nowrap transition-colors duration-150 text-foreground hover:bg-grey-100 dark:hover:bg-grey-800/60',
    active && 'bg-grey-100 dark:bg-grey-800/80 font-medium',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

export const iconClass =
  'text-[1.25rem] text-foreground shrink-0 w-5 flex items-center justify-center transition-colors duration-150';
