import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@gruenerator/ui';
import { memo } from 'react';
import { FiEdit2, FiMoreVertical, FiShare2, FiTrash2 } from 'react-icons/fi';

interface CardActionMenuProps {
  ariaLabel: string;
  onRename: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onShare?: (e: React.MouseEvent) => void;
  className?: string;
}

export const CardActionMenu = memo(function CardActionMenu({
  ariaLabel,
  onRename,
  onDelete,
  onShare,
  className,
}: CardActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          // icon-xs is a 24px box — fine beside a mouse, too small for a finger.
          // Grow the hit area on touch only, so dense desktop cards are unchanged.
          className={cn(
            'shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 max-sm:size-11 max-sm:opacity-100',
            className
          )}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label={ariaLabel}
        >
          <FiMoreVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onRename}>
          <FiEdit2 size={14} />
          Umbenennen
        </DropdownMenuItem>
        {onShare && (
          <DropdownMenuItem onClick={onShare}>
            <FiShare2 size={14} />
            Teilen
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <FiTrash2 size={14} />
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
