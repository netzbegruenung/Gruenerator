export { cn } from '@gruenerator/ui';

const composerToolbarButtonBase =
  'flex items-center rounded-lg text-foreground-muted transition-colors hover:text-foreground hover:bg-grey-100 active:bg-grey-200 dark:hover:bg-grey-800 dark:active:bg-grey-700';

export function composerToolbarButtonClass(isCompact = false): string {
  return isCompact
    ? `${composerToolbarButtonBase} gap-1 px-1.5 py-1 text-[13px]`
    : `${composerToolbarButtonBase} gap-1.5 px-2 py-1.5 text-sm`;
}
