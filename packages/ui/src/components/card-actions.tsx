import React, { useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiShare } from 'react-icons/hi';

import { cn } from '../lib/cn';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

interface CardActionsMenuProps {
  onShare?: () => void;
  onDelete?: () => void;
  shareLabel?: string;
  deleteLabel?: string;
  align?: 'start' | 'end';
  className?: string;
  children?: React.ReactNode;
}

const CardActionsMenu: React.FC<CardActionsMenuProps> = React.memo(
  ({
    onShare,
    onDelete,
    shareLabel = 'Link kopieren',
    deleteLabel = 'Löschen',
    align = 'end',
    className,
    children,
  }) => {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);

    if (!onShare && !onDelete && !children) return null;

    return (
      <div
        className={cn('shrink-0', className)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {mounted ? (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center size-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer border-none bg-transparent"
                aria-label="Aktionen"
              >
                <HiDotsVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align}>
              {children}
              {onShare && (
                <DropdownMenuItem onClick={onShare}>
                  <HiShare />
                  {shareLabel}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  {(onShare || children) && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <HiOutlineTrash />
                    {deleteLabel}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            className="flex items-center justify-center size-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer border-none bg-transparent"
            aria-label="Aktionen"
            onClick={() => {
              setMounted(true);
              setOpen(true);
            }}
          >
            <HiDotsVertical size={14} />
          </button>
        )}
      </div>
    );
  }
);

CardActionsMenu.displayName = 'CardActionsMenu';

export { CardActionsMenu, type CardActionsMenuProps };
