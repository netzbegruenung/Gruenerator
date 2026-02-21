import { DocumentList } from '@gruenerator/docs';
import { MantineProvider, Menu, ActionIcon } from '@mantine/core';
import { FiMoreVertical, FiLogOut } from 'react-icons/fi';

import { useAuth } from '../hooks/useAuth';
import { useColorScheme } from '../hooks/useColorScheme';
import { useAuthStore } from '../stores/authStore';

import '@gruenerator/docs/styles';
import '@mantine/core/styles.css';
import './HomePage.css';

export const HomePage = () => {
  const { user } = useAuth();
  const { logout } = useAuthStore();
  const colorScheme = useColorScheme();

  return (
    <MantineProvider forceColorScheme={colorScheme}>
      <div className="home-page">
        <div className="home-page-container">
          <header className="home-page-header">
            <h1 className="home-page-title">Grünerator Docs</h1>

            <div className="home-page-user-section">
              <span className="home-page-user-name">{user?.display_name || user?.email}</span>
              <Menu position="bottom-end" shadow="md" withArrow>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Menü">
                    <FiMoreVertical size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
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
            <DocumentList />
          </main>
        </div>
      </div>
    </MantineProvider>
  );
};
