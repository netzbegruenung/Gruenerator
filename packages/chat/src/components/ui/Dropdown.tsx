'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DropdownProps {
  trigger: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  showChevron?: boolean;
}

export function Dropdown({
  trigger,
  badge,
  children,
  footer,
  width = 'w-64',
  align = 'left',
  direction = 'down',
  showChevron = true,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground-muted transition-colors',
          'hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5',
          isOpen && 'text-foreground bg-black/5 dark:bg-white/5'
        )}
      >
        {trigger}
        {badge}
        {showChevron && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-foreground-muted transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 overflow-hidden rounded-xl border border-secondary-200 bg-background shadow-lg dark:border-secondary-700 dark:bg-secondary-900',
            width,
            align === 'left' ? 'left-0' : 'right-0',
            direction === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
          )}
        >
          <div className="p-1">{children}</div>
          {footer && (
            <div className="border-t border-secondary-200 px-3 py-2 dark:border-secondary-700">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  icon?: ReactNode;
  label: string;
  description?: string;
  selected?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  iconClassName?: string;
}

export function DropdownItem({
  icon,
  label,
  description,
  selected,
  onClick,
  trailing,
  iconClassName,
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        'hover:bg-secondary-50 dark:hover:bg-secondary-800',
        selected && 'bg-secondary-100 dark:bg-secondary-800'
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            iconClassName
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-foreground-muted truncate">{description}</p>
        )}
      </div>
      {trailing}
    </button>
  );
}

interface ToggleSwitchProps {
  enabled: boolean;
}

export function ToggleSwitch({ enabled }: ToggleSwitchProps) {
  return (
    <div
      className={cn(
        'h-5 w-9 rounded-full p-0.5 transition-colors',
        enabled ? 'bg-secondary-600' : 'bg-secondary-200 dark:bg-secondary-700'
      )}
    >
      <div
        className={cn(
          'h-4 w-4 rounded-full bg-white shadow transition-transform',
          enabled && 'translate-x-4'
        )}
      />
    </div>
  );
}
