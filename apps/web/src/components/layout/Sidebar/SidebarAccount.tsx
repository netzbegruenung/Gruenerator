import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gruenerator/ui';
import { LogOut } from 'lucide-react';
import { type MutableRefObject, type ReactNode, Fragment, memo, useEffect, useState } from 'react';
import { PiDesktop, PiMoon, PiQuestion, PiSun } from 'react-icons/pi';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import NotificationList from '../../../features/notifications/components/NotificationList';
import { useUnreadCount } from '../../../features/notifications/hooks/useNotifications';
import { useAuthStore } from '../../../stores/authStore';
import useDarkMode from '../../hooks/useDarkMode';
import { NAV_ITEMS } from '../Header/menuData';

import { cn } from '@/utils/cn';

interface SidebarAccountProps {
  sidebarExpanded: boolean;
  openRef: MutableRefObject<boolean>;
  onNavigate: (path: string, title: string) => void;
}

// Bottom-of-sidebar account block. The avatar is the single trigger for one
// unified account menu — identical whether the sidebar is expanded or collapsed.
// The menu lists the nav targets, with notifications inline just above
// Einstellungen, then the theme toggle and logout. Mirrors the ChatGPT/Gemini
// account anchor; replaces the standalone footer theme-toggle and the removed
// top-right ProfileButton.
const SidebarAccount = memo(function SidebarAccount({
  sidebarExpanded,
  openRef,
  onNavigate,
}: SidebarAccountProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const [, , themePreference, cycleTheme] = useDarkMode();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: profile } = useProfile(user?.id);
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep the sidebar from collapsing (hover-leave) while the menu is open.
  useEffect(() => {
    openRef.current = menuOpen;
  }, [menuOpen, openRef]);

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
        {unreadCount > 9 ? '9+' : unreadCount}
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
        <Fragment key={item.key}>
          {/* Notifications render inline just above Einstellungen; NotificationList
              returns null (and its bounding separators with it) when nothing is
              pending, so the menu reads as a plain list when empty. */}
          {item.key === 'einstellungen' && <NotificationList />}
          <DropdownMenuItem onClick={() => onNavigate(item.path, item.label)}>
            <item.icon className="size-4" />
            <span>{item.label}</span>
          </DropdownMenuItem>
        </Fragment>
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

  const kebabActions = (trigger: ReactNode) => (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {actionsMenu}
    </DropdownMenu>
  );

  return (
    <div className="mt-auto shrink-0 px-2 py-2">
      {sidebarExpanded ? (
        /* Expanded: avatar + name is the single trigger for the unified menu. */
        kebabActions(
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-1 transition-colors hover:bg-hover-alt"
            aria-label="Konto-Menü öffnen"
          >
            <span className="relative shrink-0">
              {avatarEl}
              {unreadBadge('-top-1 -right-1')}
            </span>
            <span className="truncate text-sm font-medium text-foreground-heading">
              {displayName || 'Profil'}
            </span>
          </button>
        )
      ) : (
        /* Collapsed: the avatar opens the exact same unified menu. Tooltip and
           dropdown triggers both attach to the one button via nested asChild —
           wrapping the Tooltip in DropdownMenuTrigger would swallow the click
           (Tooltip Root has no DOM node to forward the handler to). */
        <div className="flex justify-center">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-hover-alt"
                    aria-label="Konto-Menü öffnen"
                  >
                    {avatarEl}
                    {unreadBadge('-top-0.5 -right-0.5')}
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
