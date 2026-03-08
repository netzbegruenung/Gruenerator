import { FaSignOutAlt, FaUserCircle } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';

import ProfileMenu from '../../../features/auth/components/profile/ProfileMenu';
import { useProfile, useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import { useGroups } from '../../../features/groups/hooks/useGroups';
import { useOptimizedAuth } from '../../../hooks/useAuth';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

interface Profile {
  display_name?: string;
  avatar_robot_id?: number;
}

const ProfileButton = () => {
  const { user, loading, logout, isLoggingOut, isInitialLoad, setLoginIntent } = useOptimizedAuth();
  const navigate = useNavigate();

  const { data: profile } = useProfile(user?.id) as { data: Profile | undefined };

  useCustomGeneratorsData({ enabled: !!user?.id });

  const { userGroups = [] } = useGroups({ isActive: !!user?.id });

  const displayName = profile?.display_name || '';
  const avatarRobotId = profile?.avatar_robot_id ?? 1;
  const isProfileLoading = isInitialLoad;

  const getPossessiveForm = (name: string | undefined): string => {
    if (!name) return 'Dein';

    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    display_name: displayName,
    email: user?.email,
  });

  const renderAvatar = (size: 'sm' | 'lg') => {
    const sizeClass = size === 'sm' ? 'size-full' : 'size-12';
    if (avatarProps.type === 'robot') {
      return (
        <div
          className={cn('flex items-center justify-center overflow-hidden rounded-full', sizeClass)}
        >
          <img
            src={avatarProps.src}
            alt={avatarProps.alt}
            className="size-full rounded-full object-cover"
            style={{
              opacity: size === 'sm' && isProfileLoading ? 0.8 : 1,
              transition: 'opacity 0.2s ease-in-out',
            }}
          />
        </div>
      );
    }
    return (
      <FaUserCircle
        className={cn('text-foreground-heading', size === 'sm' ? 'text-lg' : 'text-[3rem]')}
        style={
          size === 'sm'
            ? { opacity: isProfileLoading ? 0.8 : 1, transition: 'opacity 0.2s ease-in-out' }
            : undefined
        }
      />
    );
  };

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center size-[38px] rounded-full border border-grey-200 dark:border-grey-700 bg-background hover:border-primary-500 hover:bg-hover-alt transition-colors overflow-hidden"
          aria-label="Profil-Menü öffnen"
        >
          {renderAvatar('sm')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px] p-0">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-md p-md bg-background-alt border-b border-grey-200 dark:border-grey-700">
            <Link
              to="/profile"
              className="shrink-0 rounded-full transition-transform hover:scale-[1.08]"
            >
              {renderAvatar('lg')}
            </Link>
            <div className="min-w-0 text-left">
              <div className="text-[1.2rem] font-semibold text-foreground-heading truncate">
                {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
              </div>
              <div className="text-[0.85rem] text-foreground opacity-80 truncate">
                {user?.email || ''}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <ProfileMenu variant="dropdown" groups={userGroups} />
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between pr-sm">
          <DropdownMenuItem
            className="flex-1 gap-sm cursor-pointer"
            onSelect={() => void navigate('/profile')}
          >
            <HiCog className="text-base opacity-80" />
            <span>Einstellungen</span>
          </DropdownMenuItem>
          <button
            className={cn(
              'flex items-center justify-center size-9 rounded-full transition-colors',
              isLoggingOut
                ? 'opacity-50 cursor-not-allowed text-foreground'
                : 'text-error cursor-pointer hover:bg-error/10'
            )}
            disabled={isLoggingOut}
            onClick={() => {
              if (!isLoggingOut) {
                void logout();
              }
            }}
            aria-label={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
            title={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
          >
            <FaSignOutAlt />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileButton;
