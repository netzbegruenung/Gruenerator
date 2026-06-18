import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gruenerator/ui';
import { Bell, LogOut } from 'lucide-react';
import { type MutableRefObject, type ReactNode, memo, useEffect, useState } from 'react';
import { PiDesktop, PiMoon, PiQuestion, PiSun } from 'react-icons/pi';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import NotificationList from '../../../features/notifications/components/NotificationList';
import { useNotifications } from '../../../features/notifications/hooks/useNotifications';
import { useAuthStore } from '../../../stores/authStore';
import useDarkMode from '../../hooks/useDarkMode';
import { NAV_ITEMS } from '../Header/menuData';

import { cn } from '@/utils/cn';

interface SidebarAccountProps {
  sidebarExpanded: boolean;
  openRef: MutableRefObject<boolean>;
  onNavigate: (path: string, title: string) => void;
}

// Bottom-of-sidebar account block. Two distinct triggers, never one mixed
// element: the avatar opens the account menu (nav targets + theme + logout),
// and a separate bell opens a notifications Popover. Notifications live in a
// Popover (not the DropdownMenu) so their action buttons, scrolling and
// pagination behave natively instead of closing the menu. Mirrors the
// ChatGPT/Gemini account anchor; replaces the removed top-right ProfileButton.
const SidebarAccount = memo(function SidebarAccount({
  sidebarExpanded,
  openRef,
  onNavigate,
}: SidebarAccountProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const [, , themePreference, cycleTheme] = useDarkMode();
  // Badge and popover both derive from this one unread-only query (shared
  // cache), so the count can never disagree with the listed notifications.
  // Page size (20) exceeds the "9+" cap, so page 1 always renders the badge
  // exactly: an exact number ≤ 9, otherwise "9+".
  const { data: notifData, hasNextPage } = useNotifications();
  const unreadCount = notifData?.pages.flat().length ?? 0;
  const unreadBadgeLabel = hasNextPage || unreadCount > 9 ? '9+' : String(unreadCount);
  const { data: profile } = useProfile(user?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Keep the sidebar from collapsing (hover-leave) while either surface is open.
  useEffect(() => {
    openRef.current = menuOpen || notifOpen;
  }, [menuOpen, notifOpen, openRef]);

  if (!user) return null;

  const displayName = profile?.display_name || '';
  const avatarRobotId = profile?.avatar_robot_id ?? null;

  const avatarEl = (
    <RobotAvatar
      robotId={avatarRobotId}
      displayName={displayName}
      email={user.email}
      sizePx={28}
      className="size-7"
      fallbackClassName="text-xs"
    />
  );

  const unreadBadge = (offset: string) =>
    unreadCount > 0 ? (
      <Badge
        variant="destructive"
        className={cn(
          'absolute flex size-4 items-center justify-center rounded-full p-0 text-[9px] font-bold',
          offset
        )}
      >
        {unreadBadgeLabel}
      </Badge>
    ) : null;

  const actionsMenu = (
    <DropdownMenuContent
      side={sidebarExpanded ? 'top' : 'right'}
      align="start"
      sideOffset={8}
      className="w-80"
    >
      {NAV_ITEMS.map((item) => (
        <DropdownMenuItem key={item.key} onClick={() => onNavigate(item.path, item.label)}>
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onClick={() => onNavigate('/support', 'Support')}>
        <PiQuestion className="size-4" />
        <span>Support</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* Theme + logout share one row to save vertical space. */}
      <div className="flex items-center gap-1">
        <DropdownMenuItem
          className="flex-1"
          onSelect={(e) => {
            // Keep the menu open so the user can click through Hell → Dunkel → System.
            e.preventDefault();
            cycleTheme();
          }}
        >
          {themePreference === 'light' ? (
            <PiSun className="size-4" />
          ) : themePreference === 'dark' ? (
            <PiMoon className="size-4" />
          ) : (
            <PiDesktop className="size-4" />
          )}
          <span>
            {themePreference === 'light'
              ? 'Heller Modus'
              : themePreference === 'dark'
                ? 'Dunkler Modus'
                : 'System'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoggingOut}
          onClick={() => {
            if (!isLoggingOut) void logout();
          }}
        >
          <LogOut className="size-4" />
          <span>{isLoggingOut ? 'Wird abgemeldet…' : 'Abmelden'}</span>
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  );

  const accountMenu = (trigger: ReactNode) => (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {actionsMenu}
    </DropdownMenu>
  );

  // Separate bell trigger → notifications Popover. Tooltip and Popover triggers
  // both attach to the one button via nested asChild (same idiom as the avatar).
  const notificationsBell = (
    <Popover open={notifOpen} onOpenChange={setNotifOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-hover-alt"
              aria-label="Benachrichtigungen"
            >
              <Bell className="size-[18px]" />
              {unreadBadge('-top-0.5 -right-0.5')}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={sidebarExpanded ? 'top' : 'right'}>Benachrichtigungen</TooltipContent>
      </Tooltip>
      <PopoverContent
        side={sidebarExpanded ? 'top' : 'right'}
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <NotificationList />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="mt-auto shrink-0 px-2 py-2">
      {sidebarExpanded ? (
        /* Expanded: avatar + name opens the account menu; bell sits at the end. */
        <div className="flex items-center gap-1">
          {accountMenu(
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-1 transition-colors hover:bg-hover-alt"
              aria-label="Konto-Menü öffnen"
            >
              <span className="shrink-0">{avatarEl}</span>
              <span className="truncate text-sm font-medium text-foreground-heading">
                {displayName || 'Profil'}
              </span>
            </button>
          )}
          {notificationsBell}
        </div>
      ) : (
        /* Collapsed: bell stacked above the account avatar. */
        <div className="flex flex-col items-center gap-1">
          {notificationsBell}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-hover-alt"
                    aria-label="Konto-Menü öffnen"
                  >
                    {avatarEl}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{displayName || 'Konto'}</TooltipContent>
            </Tooltip>
            {actionsMenu}
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});

export default SidebarAccount;
