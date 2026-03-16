import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HiDotsVertical } from 'react-icons/hi';

import type { JSX, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface KebabMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
}

const KebabMenu = ({ items }: KebabMenuProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleItemClick = (e: React.MouseEvent, item: KebabMenuItem) => {
    e.stopPropagation();
    close();
    item.onClick();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 p-0 border-none rounded-full bg-transparent text-foreground cursor-pointer transition-all duration-150 text-[1.1rem] hover:bg-background-alt hover:text-foreground-heading focus-visible:outline-2 focus-visible:outline-primary-600 focus-visible:outline-offset-2"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Aktionen"
      >
        <HiDotsVertical />
      </button>

      {open && (
        <ul
          className="absolute top-full right-0 z-50 min-w-[160px] mt-xxs py-xxs bg-background-pure border border-grey-200 dark:border-grey-700 rounded-sm shadow-lg list-none"
          role="menu"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={cn(
                  'flex items-center gap-sm w-full px-md py-sm border-none bg-transparent text-foreground text-sm cursor-pointer transition-colors duration-150 whitespace-nowrap text-left hover:bg-background-alt',
                  item.danger && 'text-red-600 hover:bg-red-600/[0.08]'
                )}
                onClick={(e) => handleItemClick(e, item)}
              >
                {item.icon && (
                  <span className="flex items-center text-base shrink-0">{item.icon}</span>
                )}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default KebabMenu;
