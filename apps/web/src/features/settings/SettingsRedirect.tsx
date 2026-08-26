import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';

// Legacy /profile/* tab names and the canonical /settings/:tab values both
// resolve here; unknown tabs fall back to Allgemein. Namen, die es mal gab,
// bleiben als Alias stehen — geteilte Links sollen nicht ins Leere laufen.
export const SETTINGS_TAB_MAP: Record<string, SettingsTab> = {
  // Führt ins Leere, sobald die Einrichtung erledigt ist — der Dialog fällt dann
  // auf Allgemein zurück, wo die Zeile steht, die sie zurückholt.
  onboarding: 'onboarding',
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
  barrierefreiheit: 'barrierefreiheit',
  // Support ist seit #2387 kein eigener Bereich mehr — seine Hälfte steht unter
  // Barrierefreiheit. Der Name bleibt als Alias stehen: geteilte Links auf
  // /settings/support gibt es, und sie sollen nicht bei Allgemein landen.
  support: 'barrierefreiheit',
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
      // Ohne Bereich im Pfad wird auch keiner benannt: Der Store steht bei einem
      // frisch geladenen Link ohnehin auf Allgemein — das Konto steht dort, und
      // der eigene Konto-Reiter existiert nicht mehr —, aber eine offene
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
