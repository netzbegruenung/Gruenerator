import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';

// Legacy /profile/* tab names and the canonical /settings/:tab values both
// resolve here; unknown tabs fall back to Allgemein. Namen, die es mal gab,
// bleiben als Alias stehen — geteilte Links sollen nicht ins Leere laufen.
const TAB_MAP: Record<string, SettingsTab> = {
  allgemein: 'allgemein',
  profil: 'allgemein',
  konto: 'allgemein',
  hintergrund: 'hintergrund',
  friends: 'friends',
  personalisierung: 'personalisierung',
  briefe: 'briefe',
  briefkoepfe: 'briefe',
  'texte-anlernen': 'texte-anlernen',
  erinnerungen: 'erinnerungen',
  benachrichtigungen: 'benachrichtigungen',
  verbindungen: 'wolke',
  wolke: 'wolke',
  konnektoren: 'konnektoren',
  mcp: 'konnektoren',
  nutzung: 'nutzung',
  support: 'support',
};

// Old profile sub-pages that were never settings — keep their redirects alive.
const PAGE_REDIRECTS: Record<string, string> = {
  gruppen: '/projekte',
  grueneratoren: '/agentura',
};

const SettingsRedirect = () => {
  const { tab } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const pageRedirect = tab ? PAGE_REDIRECTS[tab] : null;
    if (!pageRedirect) {
      // Das Konto steht jetzt in Allgemein, also landen /profile und /settings
      // beide dort — der eigene Konto-Reiter existiert nicht mehr.
      useSettingsDialogStore
        .getState()
        .openSettings(tab ? (TAB_MAP[tab] ?? 'allgemein') : 'allgemein');
    }
    void navigate(pageRedirect ?? '/workplace', { replace: true });
  }, [tab, navigate]);

  return null;
};

export default SettingsRedirect;
