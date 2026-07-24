/**
 * The hand-written half of the "Einstellungen" article: what each area of the
 * settings dialog is for, in the words of someone using it.
 *
 * The other half — which areas exist, how they are labelled, which rows and
 * choices they contain — comes from src/generated/settings.json, generated from
 * the app's own configs. index.tsx joins the two; an area without a note here
 * still renders (with its generated rows), and `settings:audit` files a GitHub
 * issue naming it. So a new settings tab doesn't break any build, but it doesn't
 * stay unexplained in silence either.
 */

export interface TabNote {
  /** Tab id from the manifest (apps/web … settingsDialogStore.ts). */
  tab: string;
  /** What this area is for — one or two sentences. */
  intro: string;
  /** Anything the generated rows don't cover: buttons, lists, side effects. */
  extras?: string[];
}

export const TAB_NOTES: TabNote[] = [
  {
    tab: 'allgemein',
    intro:
      'Aussehen und Grundverhalten der Oberfläche. Änderungen greifen sofort und gelten auf allen Geräten, an denen du angemeldet bist.',
    extras: [
      'Die Sprachwahl entscheidet nicht nur über Wortwahl, sondern auch über Inhalte: Mit „Deutsch (Österreich)" bekommst du österreichische Quellen und Begriffe statt deutscher.',
    ],
  },
  {
    tab: 'konto',
    intro:
      'Wer du bist. Name, Benutzername und E-Mail kommen aus deinem Grünen Login und lassen sich hier nur ansehen — ändern kannst du sie dort, wo du dich anmeldest.',
    extras: [
      'Dein Avatar ist frei wählbar: ein Roboter-Bild aus einer Auswahl, kein Foto-Upload.',
      'Ganz unten kannst du dein Konto endgültig löschen. Das entfernt deine Inhalte und lässt sich nicht rückgängig machen.',
    ],
  },
  {
    tab: 'personalisierung',
    intro:
      'Dauerhafte Hinweise, die der Grünerator bei jeder Antwort mitdenkt — ohne dass du sie jedes Mal neu schreiben musst.',
    extras: [
      '**Anweisungen**: ein freies Textfeld für Vorlieben wie „Duze die Leser*innen und schreibe knapp."',
      '**Deine Rollen**: Ebene (Bund, Land, Kommune), Bundesland und Funktion. Daraus weiß der Grünerator, aus welcher Perspektive du schreibst, und schlägt passende Quellen und Formulierungen vor.',
    ],
  },
  {
    tab: 'texte-anlernen',
    intro:
      'Hier bringst du dem Grünerator deinen Schreibstil bei: Du hinterlegst eigene Texte, er leitet daraus Ton, Satzbau und Länge ab und schreibt künftig ähnlich.',
    extras: [
      'Für die häufigsten Textarten gibt es Vorlagen (siehe unten); zusätzlich kannst du eigene Textarten anlegen.',
      'Pro Textart siehst du, ob und wann zuletzt angelernt wurde.',
    ],
  },
  {
    tab: 'erinnerungen',
    intro:
      'Was sich der Grünerator aus euren Gesprächen dauerhaft gemerkt hat. Du siehst jeden Eintrag, kannst suchen, einzelne löschen oder eigene hinzufügen.',
    extras: [
      'Erinnerungen entstehen im Gespräch von selbst — dieser Bereich ist die Kontrolle darüber, nicht die einzige Quelle.',
      'Alles auf einmal löschen ist möglich und wird vorher abgefragt.',
    ],
  },
  {
    tab: 'benachrichtigungen',
    intro:
      'Worüber und wie du informiert wirst. Am einfachsten wählst du eine der drei Stufen; wer es genauer mag, schaltet jede Meldungsart einzeln pro Kanal.',
  },
  {
    tab: 'wolke',
    intro:
      'Die Verbindung zur Grünen Wolke (Nextcloud). Ist sie eingerichtet, kannst du Dateien von dort direkt im Chat und in den Notebooks nutzen und Ergebnisse dorthin zurückspeichern.',
  },
  {
    tab: 'websites',
    intro:
      'Eigene Websites verbinden, damit ihre Beiträge in Notebooks zur Verfügung stehen — etwa die Seite deines Kreisverbands als Quelle für Recherche und Textentwürfe.',
    extras: [
      'Funktioniert mit WordPress-Websites, deren REST-Schnittstelle öffentlich erreichbar ist.',
      'Die Kategorien der Website werden einmal abgefragt und stehen danach überall zur Auswahl.',
    ],
  },
  {
    tab: 'konnektoren',
    intro:
      'Externe Dienste, die der Chat mitbenutzen darf. Ist einer verbunden, kannst du ihn im Gespräch ansprechen — wie das im Detail geht, steht unter Konnektoren.',
  },
  {
    tab: 'support',
    intro:
      'Kontaktwege, wenn etwas klemmt oder dir etwas fehlt: der Chat-Kanal der Community und eine E-Mail-Adresse. Hier gibt es nichts einzustellen.',
  },
];
