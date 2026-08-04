import { getFriendName, shouldShowRobotAvatar } from '@gruenerator/shared/avatar';
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
import { useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut } from 'lucide-react';
import { type MutableRefObject, type ReactNode, memo, useEffect, useState } from 'react';
import { FiServer, FiSliders } from 'react-icons/fi';
import { HiCog } from 'react-icons/hi';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import NotificationList from '../../../features/notifications/components/NotificationList';
import { useNotifications } from '../../../features/notifications/hooks/useNotifications';
import {
  useSettingsDialogStore,
  type SettingsTab,
} from '../../../features/settings/settingsDialogStore';
import {
  cancelSettingsHoverPreload,
  loadSettingsShell,
  preloadSettingsTabOnHover,
} from '../../../features/settings/settingsTabs';
import { useFirstName } from '../../../hooks/useFirstName';
import { useAuthStore } from '../../../stores/authStore';

import { cn } from '@/utils/cn';

interface SidebarAccountProps {
  sidebarExpanded: boolean;
  openRef: MutableRefObject<boolean>;
}

// Defer past the dropdown's close so the closing menu and the opening dialog
// don't fight over the Radix body pointer-events / focus lock in one commit.
const openSettingsDeferred = (tab?: SettingsTab) => {
  setTimeout(() => useSettingsDialogStore.getState().openSettings(tab), 0);
};

// Bottom-of-sidebar account block. Two distinct triggers, never one mixed
// element: the avatar opens the account menu (nav targets + settings + logout),
// and a separate bell opens a notifications Popover. Notifications live in a
// Popover (not the DropdownMenu) so their action buttons, scrolling and
// pagination behave natively instead of closing the menu. Mirrors the
// ChatGPT/Gemini account anchor; replaces the removed top-right ProfileButton.
const SidebarAccount = memo(function SidebarAccount({
  sidebarExpanded,
  openRef,
}: SidebarAccountProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  // Badge and popover both derive from this one unread-only query (shared
  // cache), so the count can never disagree with the listed notifications.
  // Page size (20) exceeds the "9+" cap, so page 1 always renders the badge
  // exactly: an exact number ≤ 9, otherwise "9+".
  const { data: notifData, hasNextPage } = useNotifications();
  const unreadCount = notifData?.pages.flat().length ?? 0;
  const unreadBadgeLabel = hasNextPage || unreadCount > 9 ? '9+' : String(unreadCount);
  const { data: profile } = useProfile(user?.id);
  const firstName = useFirstName();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Reaching for the account button, or settling on one of its settings
  // entries, happens hundreds of milliseconds before the click — long enough to
  // have the dialog chunk, the tab chunk and the tab's data in place by then.
  // The shell fires straight away (one small chunk, and every entry needs it);
  // per-tab loading waits out the intent delay, so walking the menu down to
  // "Abmelden" doesn't drag three tabs' data along with it.
  const warmSettingsShell = () => {
    void loadSettingsShell().catch(() => {});
  };
  const warmSettingsTab = (tab: SettingsTab) => {
    warmSettingsShell();
    preloadSettingsTabOnHover(tab, queryClient);
  };

  // Keep the sidebar from collapsing (hover-leave) while either surface is open.
  useEffect(() => {
    openRef.current = menuOpen || notifOpen;
  }, [menuOpen, notifOpen, openRef]);

  if (!user) return null;

  const displayName = profile?.display_name || '';
  const avatarRobotId = profile?.avatar_robot_id ?? null;
  const friendName = shouldShowRobotAvatar(avatarRobotId)
    ? getFriendName(avatarRobotId)
    : undefined;
  // "Vorname + Friend" (z.B. "Moritz + Feuri") statt des vollen Namens. Bei
  // sehr langen Vornamen bricht das Label auf zwei Zeilen um (line-clamp-2
  // unten) statt einzeilig abzuschneiden.
  const accountLabel = firstName
    ? friendName
      ? `${firstName} + ${friendName}`
      : firstName
    : displayName || 'Profil';

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
      {/* Profile header — avatar + name on top; das Konto steht in Allgemein. */}
      <DropdownMenuItem
        onSelect={() => openSettingsDeferred('allgemein')}
        onPointerEnter={() => warmSettingsTab('allgemein')}
        onFocus={() => warmSettingsTab('allgemein')}
        onPointerLeave={cancelSettingsHoverPreload}
        className="items-start gap-2 py-2"
      >
        <span className="mt-0.5 shrink-0">{avatarEl}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 break-words text-sm font-semibold text-foreground-heading">
            {accountLabel}
          </span>
          {user.email && (
            <span className="truncate text-xs font-normal text-grey-500">{user.email}</span>
          )}
        </span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* Deep links to specific settings tabs; deferred so the closing dropdown
          and the opening dialog don't fight over the Radix body/focus lock. */}
      <DropdownMenuItem
        onSelect={() => openSettingsDeferred('personalisierung')}
        onPointerEnter={() => warmSettingsTab('personalisierung')}
        onFocus={() => warmSettingsTab('personalisierung')}
        onPointerLeave={cancelSettingsHoverPreload}
      >
        <FiSliders className="size-4" />
        <span>Personalisierung</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => openSettingsDeferred('konnektoren')}
        onPointerEnter={() => warmSettingsTab('konnektoren')}
        onFocus={() => warmSettingsTab('konnektoren')}
        onPointerLeave={cancelSettingsHoverPreload}
      >
        <FiServer className="size-4" />
        <span>Konnektoren</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => openSettingsDeferred()}
        // No tab argument: this entry reopens whichever tab the store last held.
        onPointerEnter={() => warmSettingsTab(useSettingsDialogStore.getState().tab)}
        onFocus={() => warmSettingsTab(useSettingsDialogStore.getState().tab)}
        onPointerLeave={cancelSettingsHoverPreload}
      >
        <HiCog className="size-4" />
        <span>Einstellungen</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
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

  const accountMenu = (trigger: ReactNode) => (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {actionsMenu}
    </DropdownMenu>
  );

  // Separate bell trigger → notifications Popover. Tooltip and Popover triggers
  // both attach to the one button via nested asChild (same idiom as the avatar).
  // Hidden entirely when there is nothing unread — no empty bell.
  const notificationsBell =
    unreadCount === 0 ? null : (
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
          <TooltipContent side={sidebarExpanded ? 'top' : 'right'}>
            Benachrichtigungen
          </TooltipContent>
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
              onPointerEnter={warmSettingsShell}
              onFocus={warmSettingsShell}
              className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-3 py-1 transition-colors hover:bg-hover-alt"
              aria-label="Konto-Menü öffnen"
            >
              <span className="mt-0.5 shrink-0">{avatarEl}</span>
              <span className="line-clamp-2 break-words text-left text-sm font-medium text-foreground-heading">
                {accountLabel}
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
                    onPointerEnter={warmSettingsShell}
                    onFocus={warmSettingsShell}
                    className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-hover-alt"
                    aria-label="Konto-Menü öffnen"
                  >
                    {avatarEl}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{accountLabel}</TooltipContent>
            </Tooltip>
            {actionsMenu}
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});

export default SidebarAccount;
