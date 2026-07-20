import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';

// Legacy /profile/* tab names and the canonical /settings/:tab values both
// resolve here; unknown tabs fall back to Allgemein.
const TAB_MAP: Record<string, SettingsTab> = {
  allgemein: 'allgemein',
  profil: 'konto',
  konto: 'konto',
  personalisierung: 'personalisierung',
  erinnerungen: 'erinnerungen',
  benachrichtigungen: 'benachrichtigungen',
  verbindungen: 'wolke',
  wolke: 'wolke',
  konnektoren: 'konnektoren',
  mcp: 'konnektoren',
};

// Old profile sub-pages that were never settings — keep their redirects alive.
const PAGE_REDIRECTS: Record<string, string> = {
  gruppen: '/gruppen',
  grueneratoren: '/agentura',
};

const SettingsRedirect = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const pageRedirect = tab ? PAGE_REDIRECTS[tab] : null;
    if (!pageRedirect) {
      // Bare /profile kept the account view as its default; /settings opens Allgemein.
      const fallback: SettingsTab = pathname.startsWith('/profile') ? 'konto' : 'allgemein';
      useSettingsDialogStore.getState().openSettings(tab ? (TAB_MAP[tab] ?? fallback) : fallback);
    }
    void navigate(pageRedirect ?? '/workplace', { replace: true });
  }, [tab, pathname, navigate]);

  return null;
};

export default SettingsRedirect;
