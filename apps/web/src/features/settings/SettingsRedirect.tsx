import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';
import { TAB_ALIASES } from './settingsTabAliases';
import { SETTINGS_TABS } from './settingsTabs';

/**
 * `/settings/:tab` → Bereich. Unbekannte Namen fallen auf Allgemein zurück.
 *
 * `onboarding` steht darin, obwohl es aus der Seitenleiste verschwindet, sobald
 * die Einrichtung erledigt ist — der Dialog fällt dann selbst auf Allgemein
 * zurück, wo die Zeile steht, die sie zurückholt.
 */
export const SETTINGS_TAB_MAP: Record<string, SettingsTab> = {
  ...Object.fromEntries(SETTINGS_TABS.map((tab) => [tab, tab])),
  ...TAB_ALIASES,
};

// Old profile sub-pages that were never settings — keep their redirects alive.
const PAGE_REDIRECTS: Record<string, string> = {
  gruppen: '/projekte',
  grueneratoren: '/grueneratoren',
  'texte-anlernen': '/grueneratoren',
};

const SettingsRedirect = () => {
  const { tab } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const pageRedirect = tab ? PAGE_REDIRECTS[tab] : null;
    if (!pageRedirect) {
      // Ohne Bereich im Pfad wird auch keiner benannt: Der Store steht bei einem
      // frisch geladenen Link ohnehin auf Allgemein — das Konto hat seinen
      // eigenen Reiter, der Standard bleibt Allgemein —, aber eine offene
      // Einrichtung geht vor. Ein Pfad MIT Bereich meint genau den.
      useSettingsDialogStore
        .getState()
        .openSettings(tab ? (SETTINGS_TAB_MAP[tab] ?? 'allgemein') : undefined);
    }
    void navigate(pageRedirect ?? '/start', { replace: true });
  }, [tab, navigate]);

  return null;
};

export default SettingsRedirect;
