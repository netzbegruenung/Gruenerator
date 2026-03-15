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
import { useState } from 'react';
import { FiLogOut, FiSearch, FiSettings, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';

import '@gruenerator/docs/styles';
import './HomePage.css';

const UserAvatar = ({
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
        className="home-page-avatar-img"
      />
    );
  }
  return <span className="home-page-avatar-initials">{avatar.initials}</span>;
};

export const HomePage = () => {
  const { user } = useAuth();
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="home-page">
      <div className="home-page-container">
        <header className="home-page-header">
          <h1 className="home-page-title">
            <img
              src="/images/gruenerator-docs-icon.svg"
              alt="Grünerator"
              className="home-page-logo"
            />
            Docs
          </h1>

          <div className="home-page-search">
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
                className="home-page-search-input w-full rounded-lg border border-grey-200 bg-background-pure py-2 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-grey-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 dark:border-grey-700"
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

          <div className="home-page-user-section">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="home-page-avatar-btn" aria-label="Profil-Menü">
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
          <DocumentList searchQuery={searchQuery} />
        </main>
      </div>
    </div>
  );
};
