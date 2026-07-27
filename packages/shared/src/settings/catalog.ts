/**
 * Every row the settings surfaces render, in one place.
 *
 * Before this, each row carried its own `title`/`description` as literal JSX in
 * whichever tab happened to render it, so the wording of the settings surface
 * lived in four files and nothing could enumerate it — not a search, not the
 * documentation. `<SettingsRow id="…">` on web and `settingsRow(id)` on mobile
 * now look their labels up here, which keeps the wording consistent and lets
 * the docs embed it (documentation/scripts/generate-settings.mjs reads this
 * file; the article fails its audit when a row appears here without being
 * described).
 *
 * It lives in `@gruenerator/shared` rather than in `apps/web` because mobile
 * shows a deliberate subset of the same settings. When the catalog sat next to
 * the web dialog, a setting added on web was simply invisible on mobile and
 * nothing said so — the exact drift that left the chat composer's "+" menu
 * without Rezepte, Funktionen and Konnektoren for months.
 *
 * A row whose label is inherently dynamic (a connected service's name, a
 * document title) does not belong here — those stay in their component.
 */

/** Tabs of the web settings dialog. Mobile groups the same ids differently. */
export type SettingsTab =
  | 'allgemein'
  | 'barrierefreiheit'
  | 'konto'
  | 'friends'
  | 'personalisierung'
  | 'briefkoepfe'
  | 'texte-anlernen'
  | 'erinnerungen'
  | 'benachrichtigungen'
  | 'wolke'
  | 'websites'
  | 'konnektoren'
  | 'nutzung'
  | 'support';

export type SettingsPlatform = 'web' | 'mobile';

export interface SettingsCatalogEntry {
  /** Stable id, `<tab>.<row>`. Referenced by the platforms' row components. */
  id: string;
  tab: SettingsTab;
  title: string;
  description?: string;
  /**
   * Where this row exists. Omitted means web-only — the safe default, since
   * mobile is the deliberate subset and every entry predating this field was
   * written for the web dialog.
   *
   * This is what makes "what does web have that mobile doesn't?" a question the
   * code answers instead of a judgement call.
   */
  platforms?: readonly SettingsPlatform[];
}

const BOTH: readonly SettingsPlatform[] = ['web', 'mobile'];

export const SETTINGS_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'allgemein.aussehen',
    tab: 'allgemein',
    title: 'Aussehen',
    description: 'Farbschema der Oberfläche',
    platforms: BOTH,
  },
  {
    id: 'allgemein.chatHintergrund',
    tab: 'allgemein',
    title: 'Chat-Hintergrund',
    description: 'Färbt den Schimmer hinter dem Chat-Start und den Senden-Button',
    platforms: BOTH,
  },
  {
    id: 'allgemein.sprache',
    tab: 'allgemein',
    title: 'Sprache & Region',
    description: 'Wortwahl und Inhalte für Deutschland oder Österreich',
    platforms: BOTH,
  },
  {
    // Web-only until mobile actually acts on `default_startpage`. Nothing in the
    // app reads it today, so offering the row would be a control that visibly
    // does nothing on the device you set it on.
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
      'Darstellung des schwebenden Feedback-Buttons: mit Text, nur als Icon oder ganz ausgeblendet — er lässt sich in jede Bildschirmecke ziehen',
  },
  {
    id: 'barrierefreiheit.animationen',
    tab: 'barrierefreiheit',
    title: 'Animationen reduzieren',
    description:
      'Schaltet dekorative Animationen und Übergänge ab — folgt sonst automatisch der Einstellung deines Betriebssystems',
    platforms: BOTH,
  },
  {
    id: 'barrierefreiheit.transparenz',
    tab: 'barrierefreiheit',
    title: 'Transparenz reduzieren',
    description:
      'Entfernt durchscheinende Flächen und Unschärfe-Effekte — folgt sonst automatisch der Einstellung deines Betriebssystems',
    platforms: BOTH,
  },
  {
    // Web-only on purpose: the skip link exists for keyboard tabbing, which has
    // no counterpart on a touch screen.
    id: 'barrierefreiheit.sprunglink',
    tab: 'barrierefreiheit',
    title: 'Sprung-Link zum Inhalt',
    description:
      'Blendet ganz oben einen Link ein, der beim Tabben den Fokus direkt auf den Hauptinhalt setzt — standardmäßig aus',
  },
  {
    id: 'allgemein.touren',
    tab: 'allgemein',
    title: 'Einführungs-Touren zurücksetzen',
    description:
      'Zeigt die Touren durch Workplace, Dokumente, Tabellen, Präsentationen und das Sharepic-Studio beim nächsten Öffnen wieder an.',
    platforms: BOTH,
  },
  // No descriptions: these three are read-only mirrors of the Grüner Login and
  // sit under the tab's own explanation. Adding a line to each would repeat it
  // three times in a row.
  { id: 'konto.anzeigename', tab: 'konto', title: 'Anzeigename', platforms: BOTH },
  { id: 'konto.benutzername', tab: 'konto', title: 'Benutzername', platforms: BOTH },
  { id: 'konto.email', tab: 'konto', title: 'E-Mail', platforms: BOTH },
  {
    // Web-only: deleting an account is irreversible and takes a typed
    // confirmation, so it stays on the surface the user sits down at. Mobile
    // points at it in prose rather than offering the row.
    id: 'konto.loeschen',
    tab: 'konto',
    title: 'Konto löschen',
    description:
      'Entfernt Profil, gespeicherte Inhalte und den Zugang endgültig — das lässt sich nicht rückgängig machen.',
  },
  {
    id: 'friends.avatar',
    tab: 'friends',
    title: 'Dein Friend',
    description: 'Das Profilbild, das dich in Chats, Projekten und Kommentaren vertritt',
    platforms: BOTH,
  },
  {
    id: 'personalisierung.rollen',
    tab: 'personalisierung',
    title: 'Rollen',
    description:
      'Deine Ämter und Ebenen — der Grünerator richtet Ansprache und Inhalte danach aus. Anlegen und Ändern am Rechner.',
    platforms: BOTH,
  },
  {
    id: 'benachrichtigungen.stufe',
    tab: 'benachrichtigungen',
    title: 'Wie viel wir melden',
    description:
      'Wenig meldet nur Kritisches und Persönliches, Mittel die wichtigen Ereignisse, Viele alles.',
    platforms: BOTH,
  },
  {
    id: 'benachrichtigungen.testmail',
    tab: 'benachrichtigungen',
    title: 'E-Mail-Zustellung testen',
    description:
      'Sendet dir sofort eine Test-E-Mail an deine Profil-Adresse, um die Zustellung zu prüfen.',
  },
  {
    id: 'konnektoren.server',
    tab: 'konnektoren',
    title: 'Konnektoren',
    description:
      'Verbundene Dienste, die im Chat als eigene Quelle ansprechbar sind. Neue verbindest du am Rechner.',
    platforms: BOTH,
  },
  {
    id: 'nutzung.uebersicht',
    tab: 'nutzung',
    title: 'Nutzung',
    description: 'Wie viele Anfragen, Tokens, Bilder und Recherchen auf dein Konto gehen',
    platforms: BOTH,
  },
  {
    id: 'support.kontakt',
    tab: 'support',
    title: 'Support',
    description: 'Wo du Hilfe bekommst und Rückmeldung loswirst',
    platforms: BOTH,
  },
] as const;

const BY_ID = new Map(SETTINGS_CATALOG.map((entry) => [entry.id, entry]));

export function getSettingsEntry(id: string): SettingsCatalogEntry {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(
      `Unbekannte Einstellung "${id}" — trag sie in packages/shared/src/settings/catalog.ts ein, ` +
        `damit Oberfläche und Dokumentation dieselbe Beschriftung nutzen.`
    );
  }
  return entry;
}

/** Every row a platform is expected to render. The drift check compares against this. */
export function settingsForPlatform(platform: SettingsPlatform): SettingsCatalogEntry[] {
  return SETTINGS_CATALOG.filter((entry) => (entry.platforms ?? ['web']).includes(platform));
}
