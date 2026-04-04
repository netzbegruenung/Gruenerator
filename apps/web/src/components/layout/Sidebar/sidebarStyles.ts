import { cn } from '@/utils/cn';

export const menuLinkClass = (active: boolean, disabled?: boolean) =>
  cn(
    'flex items-center gap-md py-sm px-xs pl-2 mx-2 rounded-sm min-h-[40px] no-underline whitespace-nowrap transition-colors text-foreground hover:bg-hover-alt active:bg-[var(--hover-color)]',
    active && 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

export const iconClass =
  'text-[1.4rem] text-foreground shrink-0 w-6 flex items-center justify-center transition-colors xl:text-[1.5rem] 2xl:text-[1.6rem] 2xl:w-7';
