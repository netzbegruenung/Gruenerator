import { type ReactNode } from 'react';
import { Bell } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Badge } from '../badge';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';

interface NotificationBellProps {
  unreadCount: number;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  className?: string;
}

function NotificationBell({
  unreadCount,
  children,
  onOpenChange,
  label = 'Benachrichtigungen',
  className,
}: NotificationBellProps) {
  return (
    <Popover onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'relative size-[38px] rounded-full border border-grey-200 dark:border-grey-700 bg-background hover:border-primary-500 hover:bg-hover-alt transition-colors',
                className
              )}
              aria-label={label}
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full p-0 text-[10px] font-bold"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export { NotificationBell, type NotificationBellProps };
