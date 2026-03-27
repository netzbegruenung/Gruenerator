'use client';

import * as React from 'react';

import { useIsMobile } from '../hooks/use-mobile';
import { cn } from '../lib/cn';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';

interface ResponsiveMenuProps {
  trigger: React.ReactNode;
  desktopContent: React.ReactNode;
  mobileContent: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  dropdownSide?: 'top' | 'bottom' | 'left' | 'right';
  dropdownAlign?: 'start' | 'center' | 'end';
  dropdownClassName?: string;
  sheetTitle?: string;
}

function ResponsiveMenu({
  trigger,
  desktopContent,
  mobileContent,
  open,
  onOpenChange,
  dropdownSide = 'top',
  dropdownAlign = 'start',
  dropdownClassName,
  sheetTitle,
}: ResponsiveMenuProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[70vh] rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">{sheetTitle ?? 'Menü'}</SheetTitle>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-grey-300 dark:bg-grey-600" />
          <div className="overflow-y-auto">{mobileContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={dropdownSide}
        align={dropdownAlign}
        className={cn('w-48', dropdownClassName)}
      >
        {desktopContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ResponsiveMenuSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ResponsiveMenuSection({ title, children, className }: ResponsiveMenuSectionProps) {
  return (
    <div className={cn('mb-4', className)}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

interface ResponsiveMenuItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

function ResponsiveMenuItem({
  icon,
  children,
  onClick,
  active,
  disabled,
  className,
}: ResponsiveMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
        'hover:bg-grey-50 dark:hover:bg-grey-800 active:bg-grey-100 dark:active:bg-grey-700',
        active && 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {icon && <span className="shrink-0 [&_svg]:size-4 text-foreground-muted">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
}

interface ResponsiveMenuToggleProps {
  icon?: React.ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

function ResponsiveMenuToggle({
  icon,
  label,
  checked,
  onCheckedChange,
  className,
}: ResponsiveMenuToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
        'hover:bg-grey-50 dark:hover:bg-grey-800',
        checked && 'text-primary-700 dark:text-primary-400',
        className
      )}
    >
      {icon && (
        <span
          className={cn(
            'shrink-0 [&_svg]:size-4',
            checked ? 'text-primary-600 dark:text-primary-400' : 'text-foreground-muted'
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">{label}</span>
      <div
        className={cn(
          'h-5 w-9 rounded-full transition-colors relative',
          checked ? 'bg-primary-600' : 'bg-grey-300 dark:bg-grey-600'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </div>
    </button>
  );
}

export {
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
  ResponsiveMenuToggle,
  type ResponsiveMenuProps,
};
