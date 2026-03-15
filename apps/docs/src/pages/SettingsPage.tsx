import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { EditorSettingsSection } from '../components/settings/EditorSettingsSection';

import './SettingsPage.css';

export const SettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="settings-page">
      <div className="settings-container">
        <header className="settings-header">
          <button
            onClick={() => navigate('/')}
            aria-label="Zurück zur Übersicht"
            className="inline-flex items-center justify-center rounded-md p-2 text-grey-500 hover:bg-grey-100 hover:text-grey-700 dark:hover:bg-grey-800 dark:hover:text-grey-300 transition-colors"
          >
            <FiArrowLeft size={20} />
          </button>
          <h1>Einstellungen</h1>
        </header>

        <EditorSettingsSection />
      </div>
    </div>
  );
};
