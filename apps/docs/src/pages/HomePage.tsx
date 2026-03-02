import { DocumentList } from '@gruenerator/docs';
import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { MantineProvider, Menu, ActionIcon, TextInput } from '@mantine/core';
import { useState } from 'react';
import { FiLogOut, FiSearch, FiSettings, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { useColorScheme } from '../hooks/useColorScheme';
import { useAuthStore } from '../stores/authStore';

import '@gruenerator/docs/styles';
import '@mantine/core/styles.css';
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
  const colorScheme = useColorScheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <MantineProvider forceColorScheme={colorScheme}>
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
              <TextInput
                placeholder="Dokumente durchsuchen…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<FiSearch size={16} />}
                rightSection={
                  searchQuery ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                      aria-label="Suche zurücksetzen"
                    >
                      <FiX size={14} />
                    </ActionIcon>
                  ) : null
                }
                classNames={{ input: 'home-page-search-input' }}
              />
            </div>

            <div className="home-page-user-section">
              <Menu position="bottom-end" shadow="md" withArrow>
                <Menu.Target>
                  <button className="home-page-avatar-btn" aria-label="Profil-Menü">
                    <UserAvatar user={user} />
                  </button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user?.display_name || user?.email}</Menu.Label>
                  <Menu.Item
                    leftSection={<FiSettings size={14} />}
                    onClick={() => navigate('/settings')}
                  >
                    Einstellungen
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<FiLogOut size={14} />}
                    onClick={() => logout()}
                    color="red"
                  >
                    Abmelden
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          </header>

          <main>
            <DocumentList searchQuery={searchQuery} />
          </main>
        </div>
      </div>
    </MantineProvider>
  );
};
