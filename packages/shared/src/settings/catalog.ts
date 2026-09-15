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

/**
 * Tabs of the web settings dialog. Mobile groups the same ids differently.
 *
 * Ein Reiter-Schlüssel ist nicht frei umbenennbar: `/settings/:tab` löst über
 * ihn auf. Wird einer zusammengelegt, bleibt der alte Name als Alias in
 * `SETTINGS_TAB_MAP` (apps/web … settings/SettingsRedirect.tsx) stehen — hier
 * verschwindet er.
 *
 * `barrierefreiheit` ist am 28.08.2026 in `datenschutz` aufgegangen; die
 * Zeilen-ids `barrierefreiheit.*` sind davon unberührt (apps/mobile liest zwei
 * davon über `getSettingsEntry`).
 */
export type SettingsTab =
  | 'onboarding'
  | 'allgemein'
  | 'hintergrund'
  | 'datenschutz'
  | 'friends'
  | 'personalisierung'
  | 'briefe'
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
    // Web-only: the app dropped its Konto overview. Rows the user cannot change,
    // restating what the Grüner Login already shows, earned no space on a
    // surface built for reading state at a glance. Deleting an account is
    // irreversible and takes a typed confirmation, so it stays on the surface
    // the user sits down at; mobile points at it in prose.
    id: 'allgemein.konto',
    tab: 'allgemein',
    title: 'Konto',
    description:
      'Name, Benutzername und E-Mail stammen aus deinem Grünen Login und werden dort geändert',
  },
  {
    id: 'allgemein.aussehen',
    tab: 'allgemein',
    title: 'Aussehen',
    description: 'Farbschema der Oberfläche',
    platforms: BOTH,
  },
  {
    // Eigener Bereich statt einer Zeile in Allgemein: die Auswahl ist eine
    // Fläche aus Vorschau-Kacheln, keine Steuerung, die rechts neben eine
    // Beschriftung passt.
    //
    // „Startseite" meint die Fläche, auf der man nach dem Anmelden steht — den
    // Chat-Start. Der alte Name „Chat-Hintergrund" las sich, als ginge es um
    // die Fläche hinter einem laufenden Gespräch; gemeint war immer die
    // Startfläche.
    id: 'hintergrund.startseite',
    tab: 'hintergrund',
    title: 'Startseiten-Hintergrund',
    description: 'Färbt den Schimmer hinter dem Chat-Start und den Senden-Button darauf',
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
    // Web-only for now: the choice is applied server-side, so the app speaks
    // with it too — it just has no row to change it yet.
    id: 'allgemein.stimme',
    tab: 'allgemein',
    title: 'Stimme',
    description: 'Mit welcher Stimme dir der Grünerator Texte vorliest',
  },
  {
    id: 'allgemein.feedbackButton',
    tab: 'allgemein',
    title: 'Feedback-Button',
    description:
      'Darstellung des schwebenden Feedback-Buttons: mit Text, nur als Icon oder ganz ausgeblendet — er lässt sich in jede Bildschirmecke ziehen',
  },
  {
    // Web-only: beide Schalter schreiben in den localStorage bzw. das Profil des
    // Browsers, in dem Umami überhaupt läuft. Die App lädt kein Umami.
    id: 'datenschutz.reichweitenmessung',
    tab: 'datenschutz',
    title: 'Reichweitenmessung',
    description:
      'Anonyme Statistik mit Umami (eigene Server, EU). Nur nach Einwilligung — jederzeit widerrufbar',
  },
  {
    // Auf beiden Plattformen, anders als die Reichweitenmessung darüber: die
    // Einwilligung hängt am Profil und gilt geräteübergreifend, also muss sie
    // auch dort widerrufbar sein, wo man gerade ist.
    id: 'datenschutz.ki-einwilligung',
    tab: 'datenschutz',
    title: 'Einwilligung in die KI-Verarbeitung',
    description:
      'Ausdrückliche Einwilligung nach Art. 9 DSGVO, weil sich aus deinen Eingaben politische Meinungen ergeben können',
    platforms: BOTH,
  },
  {
    id: 'barrierefreiheit.animationen',
    tab: 'datenschutz',
    title: 'Animationen reduzieren',
    description:
      'Schaltet dekorative Animationen und Übergänge ab — folgt sonst automatisch der Einstellung deines Betriebssystems',
    platforms: BOTH,
  },
  {
    id: 'barrierefreiheit.transparenz',
    tab: 'datenschutz',
    title: 'Transparenz reduzieren',
    description:
      'Entfernt durchscheinende Flächen und Unschärfe-Effekte — folgt sonst automatisch der Einstellung deines Betriebssystems',
    platforms: BOTH,
  },
  {
    // Mobile-only, and device-local rather than a profile field: it is about
    // what this handset can afford, not about how the person wants to be shown
    // things. iOS has no blur to switch off (the tab bar is a real UITabBar),
    // so the row does not appear there either.
    id: 'barrierefreiheit.leistung',
    tab: 'datenschutz',
    title: 'Leistungsmodus',
    description:
      'Schaltet den Blur hinter der Tab-Leiste ab. Hilft auf älteren Geräten, gilt nur auf diesem',
    platforms: ['mobile'],
  },
  {
    // Web-only: this resets the driver.js tours through Workplace, Dokumente,
    // Tabellen, Präsentationen und Sharepic-Studio — surfaces the app doesn't
    // have. The app's "Einführung erneut ansehen" opens its own onboarding and is
    // a different thing, not this row.
    id: 'allgemein.touren',
    tab: 'allgemein',
    title: 'Einführungs-Touren zurücksetzen',
    description:
      'Zeigt die Touren durch Workplace, Dokumente, Tabellen, Präsentationen und das Sharepic-Studio beim nächsten Öffnen wieder an.',
  },
  {
    // Web-only, wie der Bereich selbst: die Einrichtung stellt Rolle, Friend und
    // Hintergrund ein, und die Rollen legt man laut Katalog ohnehin am Rechner
    // an. Die Zeile steht in Allgemein, weil der Bereich „Onboarding" nach dem
    // Abschluss verschwindet — ohne sie gäbe es keinen Weg zurück.
    id: 'allgemein.onboarding',
    tab: 'allgemein',
    title: 'Einrichtung erneut starten',
    description:
      'Holt den Bereich „Onboarding" zurück und führt noch einmal durch Rolle, Friend und Hintergrund.',
  },
  {
    id: 'friends.avatar',
    tab: 'friends',
    title: 'Dein Friend',
    description: 'Das Profilbild, das dich in Chats, Projekten und Kommentaren vertritt',
    platforms: BOTH,
  },
  {
    id: 'erinnerungen.gedaechtnis',
    tab: 'erinnerungen',
    title: 'Gedächtnis',
    description:
      'Der Grünerator merkt sich nur, was du ihm ausdrücklich sagst („merk dir …") — und berücksichtigt es in jedem Chat. Aus: nichts wird gespeichert oder verwendet.',
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
    // Web-only: die App empfängt Push-Benachrichtigungen, stellt sie aber
    // nirgends ein. Die Stufe gilt kontoweit — sie am Rechner zu setzen wirkt
    // auf dem Gerät mit, eine Zeile ohne Fläche dahinter nicht.
    id: 'benachrichtigungen.stufe',
    tab: 'benachrichtigungen',
    title: 'Wie viel wir melden',
    description:
      'Wenig meldet nur Kritisches und Persönliches, Mittel die wichtigen Ereignisse, Viele alles.',
  },
  {
    id: 'benachrichtigungen.testmail',
    tab: 'benachrichtigungen',
    title: 'E-Mail-Zustellung testen',
    description:
      'Sendet dir sofort eine Test-E-Mail an deine Profil-Adresse, um die Zustellung zu prüfen.',
  },
  {
    // Web-only: Verbinden läuft über einen OAuth-Umweg im Browser, den die App
    // nicht abschließt. Eine reine Leseliste ohne den Schritt, der sie füllt,
    // wäre eine Zeile, die auf den Rechner verweist.
    id: 'konnektoren.server',
    tab: 'konnektoren',
    title: 'Konnektoren',
    description: 'Verbundene Dienste, die im Chat als eigene Quelle ansprechbar sind',
  },
  {
    // Web-only: die Übersicht ist eine Tabelle über Zeiträume hinweg. Sie
    // sinnvoll auf ein Sheet zu bringen ist eine eigene Fläche, keine Zeile.
    id: 'nutzung.uebersicht',
    tab: 'nutzung',
    title: 'Nutzung',
    description: 'Wie viele Anfragen, Tokens, Bilder und Recherchen auf dein Konto gehen',
  },
  {
    // Web-only: die App hat keine Support-Fläche. Der Weg dorthin führt
    // ohnehin nach außen (Doku, Feedback, Mail), nicht in eine App-Einstellung.
    id: 'support.kontakt',
    tab: 'support',
    title: 'Support',
    description: 'Wo du Hilfe bekommst und Rückmeldung loswirst',
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
