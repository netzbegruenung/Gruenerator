import { ActionIcon, MantineProvider } from '@mantine/core';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { EditorSettingsSection } from '../components/settings/EditorSettingsSection';
import { WolkeConnectionSection } from '../components/settings/WolkeConnectionSection';
import { useColorScheme } from '../hooks/useColorScheme';

import '@mantine/core/styles.css';
import './SettingsPage.css';

export const SettingsPage = () => {
  const colorScheme = useColorScheme();
  const navigate = useNavigate();

  return (
    <MantineProvider forceColorScheme={colorScheme}>
      <div className="settings-page">
        <div className="settings-container">
          <header className="settings-header">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => navigate('/')}
              aria-label="Zurück zur Übersicht"
            >
              <FiArrowLeft size={20} />
            </ActionIcon>
            <h1>Einstellungen</h1>
          </header>

          <EditorSettingsSection />
          <WolkeConnectionSection />
        </div>
      </div>
    </MantineProvider>
  );
};
