import { type SettingsTab } from './settingsDialogStore';

/**
 * Every row the settings dialog renders through <SettingsRow>, in one place.
 *
 * Before this, each row carried its own `title`/`description` as literal JSX in
 * whichever tab happened to render it, so the wording of the settings surface
 * lived in four files and nothing could enumerate it — not a search, not the
 * documentation. <SettingsRow id="…"> now looks its labels up here, which keeps
 * the wording consistent and lets the docs embed it (documentation/scripts/
 * generate-settings.mjs reads this file; the article fails its audit when a row
 * appears here without being described).
 *
 * A row whose label is inherently dynamic (a connected service's name, a
 * document title) does not belong here — those stay in their component.
 */
export interface SettingsCatalogEntry {
  /** Stable id, `<tab>.<row>`. Referenced by <SettingsRow id>. */
  id: string;
  tab: SettingsTab;
  title: string;
  description?: string;
}

export const SETTINGS_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'allgemein.aussehen',
    tab: 'allgemein',
    title: 'Aussehen',
    description: 'Farbschema der Oberfläche',
  },
  {
    id: 'allgemein.chatHintergrund',
    tab: 'allgemein',
    title: 'Chat-Hintergrund',
    description: 'Färbt den Schimmer hinter dem Chat-Start und den Senden-Button',
  },
  {
    id: 'allgemein.sprache',
    tab: 'allgemein',
    title: 'Sprache & Region',
    description: 'Wortwahl und Inhalte für Deutschland oder Österreich',
  },
  {
    id: 'allgemein.startseite',
    tab: 'allgemein',
    title: 'Startseite',
    description: 'Was das Start-Symbol in der Seitenleiste öffnet',
  },
  {
    id: 'allgemein.feedbackButton',
    tab: 'allgemein',
    title: 'Feedback-Button',
    description:
      'Zeigt den schwebenden Feedback-Button auf allen Seiten — er lässt sich in jede Bildschirmecke ziehen',
  },
  {
    id: 'allgemein.animationen',
    tab: 'allgemein',
    title: 'Animationen reduzieren',
    description:
      'Schaltet dekorative Animationen und Übergänge ab — folgt sonst automatisch der Einstellung deines Betriebssystems',
  },
  {
    id: 'allgemein.transparenz',
    tab: 'allgemein',
    title: 'Transparenz reduzieren',
    description:
      'Entfernt durchscheinende Flächen und Unschärfe-Effekte — folgt sonst automatisch der Einstellung deines Betriebssystems',
  },
  {
    id: 'allgemein.touren',
    tab: 'allgemein',
    title: 'Einführungs-Touren zurücksetzen',
    description:
      'Zeigt die Touren durch Workplace, Dokumente, Tabellen, Präsentationen und das Sharepic-Studio beim nächsten Öffnen wieder an.',
  },
  // No descriptions: these three are read-only mirrors of the Grüner Login and
  // sit under the tab's own explanation. Adding a line to each would repeat it
  // three times in a row.
  { id: 'konto.anzeigename', tab: 'konto', title: 'Anzeigename' },
  { id: 'konto.benutzername', tab: 'konto', title: 'Benutzername' },
  { id: 'konto.email', tab: 'konto', title: 'E-Mail' },
  {
    id: 'benachrichtigungen.testmail',
    tab: 'benachrichtigungen',
    title: 'E-Mail-Zustellung testen',
    description:
      'Sendet dir sofort eine Test-E-Mail an deine Profil-Adresse, um die Zustellung zu prüfen.',
  },
] as const;

const BY_ID = new Map(SETTINGS_CATALOG.map((entry) => [entry.id, entry]));

export function getSettingsEntry(id: string): SettingsCatalogEntry {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(
      `Unbekannte Einstellung "${id}" — trag sie in settingsCatalog.ts ein, damit ` +
        `Oberfläche und Dokumentation dieselbe Beschriftung nutzen.`
    );
  }
  return entry;
}
