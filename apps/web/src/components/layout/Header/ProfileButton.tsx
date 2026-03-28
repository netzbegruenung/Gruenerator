import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  LiteTooltip,
} from '@gruenerator/ui';
import { LogOut } from 'lucide-react';
import { memo, useState } from 'react';
import { FaCloud, FaFolder, FaUserCircle, FaUsers } from 'react-icons/fa';
import { HiCog, HiChat } from 'react-icons/hi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useProfile } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import NotificationList from '../../../features/notifications/components/NotificationList';
import {
  useUnreadCount,
  useMarkAllAsRead,
} from '../../../features/notifications/hooks/useNotifications';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';

import type { AvatarDisplay, Profile } from '../../../features/auth/services/profileApiService';
import type { User } from '../../../stores/authStore';
import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';

interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: IconType;
  betaFeature?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'gruppen', label: 'Gruppen', path: '/gruppen', icon: FaUsers, betaFeature: 'groups' },
  { key: 'dein-gruenerator', label: 'Dein Grünerator', path: '/dein-gruenerator', icon: HiChat },
  { key: 'inhalte', label: 'Dateien', path: '/profile/inhalte', icon: FaFolder },
  { key: 'wolke', label: 'Wolke', path: '/profile/wolke', icon: FaCloud },
  { key: 'einstellungen', label: 'Einstellungen', path: '/profile', icon: HiCog },
];

const getPossessiveForm = (name: string | undefined): string => {
  if (!name) return 'Dein';
  if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
    return `${name}'`;
  }
  return `${name}'s`;
};

const renderAvatar = (avatarProps: AvatarDisplay, size: 'sm' | 'lg', isLoading?: boolean) => {
  const sizeClass = size === 'sm' ? 'size-full' : 'size-12';
  const loadingStyle = isLoading
    ? { opacity: 0.8, transition: 'opacity 0.2s ease-in-out' }
    : undefined;

  if (avatarProps.type === 'robot') {
    return (
      <div
        className={cn('flex items-center justify-center overflow-hidden rounded-full', sizeClass)}
      >
        <img
          src={avatarProps.src}
          alt={avatarProps.alt}
          className="size-full rounded-full object-cover"
          style={loadingStyle}
        />
      </div>
    );
  }
  return (
    <FaUserCircle
      className={cn('text-foreground-heading', size === 'sm' ? 'text-lg' : 'text-[3rem]')}
      style={loadingStyle}
    />
  );
};

interface ProfileDropdownContentProps {
  user: User;
  unreadCount: number;
}

const ProfileDropdownContent = memo(({ user, unreadCount }: ProfileDropdownContentProps) => {
  const { logout, isLoggingOut } = useOptimizedAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { shouldShowTab } = useBetaFeatures();

  const { data: profile } = useProfile(user.id);

  const displayName = profile?.display_name || '';
  const avatarRobotId = profile?.avatar_robot_id ?? null;

  const avatarProps = getAvatarDisplayProps({
    ...(avatarRobotId != null && { avatar_robot_id: avatarRobotId }),
    display_name: displayName,
    email: user.email,
  });

  const filteredNavItems = NAV_ITEMS.filter((item) =>
    item.betaFeature ? shouldShowTab(item.betaFeature) : true
  );

  return (
    <>
      <div className="flex items-center gap-md p-md bg-background-alt border-b border-grey-200 dark:border-grey-700">
        <Link
          to="/profile"
          className="shrink-0 rounded-full transition-transform hover:scale-[1.08]"
        >
          {renderAvatar(avatarProps, 'lg')}
        </Link>
        <div className="min-w-0 text-left">
          <div className="text-[1.2rem] font-semibold text-foreground-heading truncate">
            {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
          </div>
          <div className="text-[0.85rem] text-foreground opacity-80 truncate">{user.email}</div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-xs px-md py-sm">
        {filteredNavItems.map((item) => {
          const isActive =
            item.key === 'einstellungen'
              ? location.pathname === '/profile'
              : location.pathname.startsWith(item.path);
          return (
            <LiteTooltip key={item.key} label={item.label}>
              <button
                type="button"
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex items-center justify-center size-9 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400'
                    : 'text-grey-500 hover:bg-background-alt hover:text-foreground'
                )}
                aria-label={item.label}
              >
                <item.icon className="size-4" />
              </button>
            </LiteTooltip>
          );
        })}
        <div className="w-px h-5 bg-grey-200 dark:bg-grey-700 mx-xxs" />
        <LiteTooltip label={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}>
          <button
            type="button"
            onClick={() => {
              if (!isLoggingOut) void logout();
            }}
            disabled={isLoggingOut}
            className={cn(
              'flex items-center justify-center size-9 rounded-lg transition-colors',
              isLoggingOut
                ? 'opacity-50 cursor-not-allowed text-grey-400'
                : 'text-grey-500 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600'
            )}
            aria-label={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
          >
            <LogOut className="size-4" />
          </button>
        </LiteTooltip>
      </div>

      <NotificationList unreadCount={unreadCount} />
    </>
  );
});
ProfileDropdownContent.displayName = 'ProfileDropdownContent';

const ProfileButton = () => {
  const { user, loading, setLoginIntent } = useOptimizedAuth();
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0 } = useUnreadCount();
  const markAllAsRead = useMarkAllAsRead();

  const { data: profile, isPlaceholderData } = useProfile(user?.id);
  const avatarRobotId = profile?.avatar_robot_id ?? null;
  const displayName = profile?.display_name || '';

  const avatarProps = getAvatarDisplayProps({
    ...(avatarRobotId != null && { avatar_robot_id: avatarRobotId }),
    display_name: displayName,
    email: user?.email,
  });

  if (!loading && !user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-xxs text-foreground-heading no-underline px-sm py-xs rounded-sm transition-colors hover:bg-background-alt"
        aria-label="Anmelden"
        onClick={() => setLoginIntent()}
      >
        <FaUserCircle className="text-lg text-foreground-heading" />
      </Link>
    );
  }

  if (!user && loading) {
    return (
      <button
        className="flex items-center justify-center size-[38px] rounded-full border border-grey-200 dark:border-grey-700 bg-background transition-colors overflow-hidden"
        disabled
        aria-label="Profil wird geladen"
      >
        <FaUserCircle className="text-lg text-foreground-heading" />
      </button>
    );
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen && unreadCount > 0) markAllAsRead.mutate();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center justify-center size-[38px] rounded-full border border-grey-200 dark:border-grey-700 bg-background hover:border-primary-500 hover:bg-hover-alt transition-colors"
          aria-label="Profil-Menü öffnen"
        >
          {avatarRobotId == null && !displayName ? (
            <div className="size-full rounded-full bg-grey-200 dark:bg-grey-700 animate-pulse" />
          ) : (
            renderAvatar(avatarProps, 'sm', isPlaceholderData)
          )}
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full p-0 text-[9px] font-bold"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-0" sideOffset={8}>
        {open && user && <ProfileDropdownContent user={user} unreadCount={unreadCount} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default memo(ProfileButton);
