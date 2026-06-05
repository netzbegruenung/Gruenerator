import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gruenerator/ui';
import { LogOut } from 'lucide-react';
import { type MutableRefObject, type ReactNode, memo, useEffect, useState } from 'react';
import { FaUserCircle } from 'react-icons/fa';
import { HiCog, HiDotsVertical } from 'react-icons/hi';
import { PiBell, PiDesktop, PiMoon, PiQuestion, PiSun } from 'react-icons/pi';

import { useProfile } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import NotificationList from '../../../features/notifications/components/NotificationList';
import { useUnreadCount } from '../../../features/notifications/hooks/useNotifications';
import { useAuthStore } from '../../../stores/authStore';
import useDarkMode from '../../hooks/useDarkMode';
import { NAV_ITEMS } from '../Header/ProfileButton';

import { cn } from '@/utils/cn';

interface SidebarAccountProps {
  sidebarExpanded: boolean;
  openRef: MutableRefObject<boolean>;
  onNavigate: (path: string, title: string) => void;
}

// Bottom-of-sidebar account block. Clicking the avatar + name opens the
// notifications panel; the 3-dot kebab opens the account actions (nav targets,
// theme toggle, logout). When collapsed, the avatar opens the actions menu.
// Mirrors the ChatGPT/Gemini account anchor; replaces the standalone footer
// theme-toggle and the removed top-right ProfileButton.
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
  const [notifOpen, setNotifOpen] = useState(false);

  // Keep the sidebar from collapsing (hover-leave) while either popover is open.
  useEffect(() => {
    openRef.current = menuOpen || notifOpen;
  }, [menuOpen, notifOpen, openRef]);

  if (!user) return null;

  const displayName = profile?.display_name || '';
  const avatarRobotId = profile?.avatar_robot_id ?? null;
  const avatarProps = getAvatarDisplayProps({
    ...(avatarRobotId != null && { avatar_robot_id: avatarRobotId }),
    display_name: displayName,
    email: user.email,
  });

  const avatarEl =
    avatarProps.type === 'robot' ? (
      <img
        src={avatarProps.src}
        alt={avatarProps.alt}
        className="size-7 rounded-full object-cover"
      />
    ) : (
      <FaUserCircle className="size-7 text-foreground-heading" />
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
      align={sidebarExpanded ? 'end' : 'start'}
      sideOffset={8}
      className="w-56"
    >
      {/* Notifications live on the avatar+name when expanded; surface them here when collapsed */}
      {!sidebarExpanded && (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <PiBell className="size-4" />
              <span>Benachrichtigungen</span>
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-80 p-0">
              <NotificationList unreadCount={unreadCount} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
        </>
      )}
      {/* Einstellungen lives on the gear when expanded; keep it in the menu when collapsed */}
      {NAV_ITEMS.filter((item) => !(sidebarExpanded && item.key === 'einstellungen')).map(
        (item) => (
          <DropdownMenuItem key={item.key} onClick={() => onNavigate(item.path, item.label)}>
            <item.icon className="size-4" />
            <span>{item.label}</span>
          </DropdownMenuItem>
        )
      )}
      <DropdownMenuItem onClick={() => onNavigate('/support', 'Support')}>
        <PiQuestion className="size-4" />
        <span>Support</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
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
      <DropdownMenuSeparator />
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
        <div className="flex items-center gap-1">
          {/* Avatar + name -> notifications */}
          <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-1 transition-colors hover:bg-hover-alt"
                aria-label="Benachrichtigungen öffnen"
              >
                <span className="relative shrink-0">
                  {avatarEl}
                  {unreadBadge('-top-1 -right-1')}
                </span>
                <span className="truncate text-sm font-medium text-foreground-heading">
                  {displayName || 'Profil'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-80 p-0">
              <NotificationList unreadCount={unreadCount} />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings gear -> profile */}
          <button
            type="button"
            onClick={() => onNavigate('/profile', 'Einstellungen')}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-grey-500 transition-colors hover:bg-hover-alt hover:text-foreground"
            aria-label="Einstellungen öffnen"
          >
            <HiCog className="size-5" />
          </button>

          {/* Kebab -> actions */}
          {kebabActions(
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-grey-500 transition-colors hover:bg-hover-alt hover:text-foreground"
              aria-label="Konto-Menü öffnen"
            >
              <HiDotsVertical className="size-5" />
            </button>
          )}
        </div>
      ) : (
        /* Collapsed: only the profile button (avatar); it opens the account menu,
           which carries notifications as a submenu. No standalone kebab. */
        <div className="flex justify-center">
          {kebabActions(
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-hover-alt"
                  aria-label="Konto-Menü öffnen"
                >
                  {avatarEl}
                  {unreadBadge('-top-0.5 -right-0.5')}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{displayName || 'Konto'}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
});

export default SidebarAccount;
