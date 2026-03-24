import { DocumentList } from '@gruenerator/docs';
import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useDeferredValue, useState } from 'react';
import { FiLogOut, FiSearch, FiSettings, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';

import '@gruenerator/docs/styles';

const UserAvatar = memo(
  ({
    user,
  }: {
    user: { display_name?: string; email?: string; avatar_robot_id?: number } | null;
  }) => {
    const avatar = getAvatarDisplayProps(user);
    if (avatar.type === 'robot' && avatar.robotId) {
      return (
        <img
          src={getRobotAvatarPath(avatar.robotId)}
          alt={avatar.alt || ''}
          className="w-full h-full object-cover"
        />
      );
    }
    return (
      <span className="text-[0.8rem] font-semibold text-foreground leading-none">
        {avatar.initials}
      </span>
    );
  }
);
UserAvatar.displayName = 'UserAvatar';

export const HomePage = () => {
  const { user } = useAuth();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1200px] px-md py-lg md:px-xl md:py-xl">
        <header className="mb-lg pb-md border-b border-grey-200 dark:border-grey-700 flex flex-wrap items-center justify-between gap-sm gap-x-md sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-md md:mb-xl md:pb-lg">
          <h1 className="m-0 text-xl font-semibold text-foreground flex items-center gap-2 font-[Raleway,PT_Sans,Arial,sans-serif] sm:text-2xl">
            <img
              src="/images/gruenerator-docs-icon.svg"
              alt="Grünerator"
              className="h-8 w-auto sm:h-9"
            />
            Docs
          </h1>

          <div className="order-3 w-full sm:order-none sm:max-w-[480px] sm:justify-self-center md:max-w-[520px]">
            <div className="relative">
              <FiSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-400"
              />
              <input
                type="text"
                placeholder="Dokumente durchsuchen…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-grey-200 bg-grey-50 py-2 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-grey-400 focus:border-secondary-600 focus:ring-1 focus:ring-secondary-600/30 dark:border-grey-700 dark:bg-grey-800 dark:focus:border-secondary-600"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Suche zurücksetzen"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-grey-400 hover:bg-grey-100 hover:text-grey-600 dark:hover:bg-grey-800"
                >
                  <FiX size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center w-9 h-9 rounded-full border-2 border-grey-200 bg-grey-50 cursor-pointer p-0 overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-secondary-600 hover:shadow-[0_0_0_2px_rgba(95,133,117,0.15)] dark:bg-grey-800 dark:border-grey-600 dark:hover:border-secondary-600 sm:w-10 sm:h-10"
                  aria-label="Profil-Menü"
                >
                  <UserAvatar user={user} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-background-pure shadow-lg border border-grey-200 dark:border-grey-700"
              >
                <DropdownMenuLabel className="text-foreground">
                  {user?.display_name || user?.email}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <FiSettings size={14} />
                  Einstellungen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="text-red-600 focus:text-red-600"
                >
                  <FiLogOut size={14} />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main>
          <DocumentList searchQuery={deferredSearch} />
        </main>
      </div>
    </div>
  );
};
