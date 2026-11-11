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
    tab: 'onboarding',
    intro:
      'Die einmalige Einrichtung: drei Schritte, die den Grünerator auf dich einstellen — deine Rolle, dein Friend und der Hintergrund deiner Startseite. Der Bereich steht ganz oben, solange er offen ist, und verschwindet danach aus der Liste.',
    extras: [
      'Jeder Schritt lässt sich überspringen, einzeln oder alle auf einmal — übersprungen heißt: es bleibt beim Standard, nichts wird später nachgefragt.',
      'Die drei Schritte zeigen dieselben Bereiche, die es auch einzeln gibt („Personalisierung", „Friends", „Hintergrund"). Was du hier einstellst, ist sofort gespeichert und dort später änderbar.',
      'Zurückholen kannst du die Einrichtung jederzeit über **Allgemein → Einrichtung erneut starten**.',
    ],
  },
  {
    tab: 'allgemein',
    intro:
      'Aussehen und Grundverhalten der Oberfläche — und ganz oben, wer du bist. Änderungen greifen sofort und gelten auf allen Geräten, an denen du angemeldet bist.',
    extras: [
      'Die Zeile **Konto** zeigt Anzeigename, Benutzername und E-Mail. Die drei kommen aus deinem Grünen Login und lassen sich nur dort ändern, wo du dich anmeldest.',
      'Dein Profilbild ist ein Grünerator Friend — ausgewählt wird er im Bereich „Friends".',
      'Die Sprachwahl entscheidet nicht nur über Wortwahl, sondern auch über Inhalte: Mit „Deutsch (Österreich)" bekommst du österreichische Quellen und Begriffe statt deutscher.',
      'Die Zeile **Papierkorb** öffnet die Seite mit allem, was du gelöscht hast. Dort bleibt es 30 Tage, lässt sich wiederherstellen oder vorher endgültig löschen. Erreichbar ist sie auch über das Kontomenü in der Seitenleiste und über „Zuletzt" im Workplace.',
      'Ganz unten kannst du dein Konto endgültig löschen. Das entfernt deine Inhalte und lässt sich nicht rückgängig machen.',
    ],
  },
  {
    tab: 'hintergrund',
    intro:
      'Der farbige Schimmer auf deiner Startseite — der Fläche, auf der du nach dem Anmelden stehst. Jede Kachel zeigt den Verlauf, den sie einstellt; ein Klick übernimmt ihn sofort.',
    extras: [
      'Die Auswahl ist zweigeteilt: **Bunt** verteilt mehrere Farben über die Fläche, **Einfarbig** legt einen Ton darüber. Innerhalb von „Bunt" unterscheiden sich **Nebel**, **Klarer Kern** und **Dunst von unten** nicht in der Farbe — sie nutzen dieselben vier Töne hinter unterschiedlich viel weißem Schleier.',
      'Der Senden-Button unter dem Composer übernimmt die Farbe des gewählten Hintergrunds — die Kachel zeigt ihn als Punkt mit an.',
      '**Neutral** schaltet den Verlauf ganz ab; dann steht dort die normale Seitenfläche.',
      'Im Dunkelmodus bleiben dieselben Presets, nur gedämpft — die Kacheln zeigen die Fassung, die zu deinem Farbschema gehört.',
    ],
  },
  {
    tab: 'datenschutz',
    intro:
      'Ein Bereich mit zwei Gruppen. Oben die beiden Einwilligungen, die der Grünerator von dir einholt: Beide gelten mit Wirkung für die Zukunft und lassen sich jederzeit zurücknehmen — was bereits verarbeitet wurde, bleibt davon unberührt. Unten die Einstellungen, die die Oberfläche zugänglicher machen: Sie folgen zunächst den Vorgaben deines Betriebssystems und lassen sich hier gezielt übersteuern.',
    extras: [
      '**Reichweitenmessung** steuert die anonyme Statistik mit Umami, die wir auf eigenen Servern in der EU betreiben. Ohne deine Zustimmung wird das Skript gar nicht erst geladen; der Schalter gilt für den Browser, in dem du ihn umlegst.',
      '**Einwilligung in die KI-Verarbeitung** ist die ausdrückliche Einwilligung nach Art. 9 DSGVO: Weil über den Grünerator politische Inhalte entstehen, können sich aus deinen Eingaben politische Meinungen ergeben. Nimmst du sie zurück, fragen wir beim nächsten Aufruf der KI-Funktionen erneut.',
      '**Animationen reduzieren** und **Transparenz reduzieren** schalten dekorative Bewegung bzw. durchscheinende Flächen und Unschärfe ab — hilfreich bei Reizempfindlichkeit oder auf schwächerer Hardware. Sie gelten auf allen Geräten, an denen du angemeldet bist, und greifen sofort.',
      'Der Link **/settings/barrierefreiheit** führt weiterhin hierher — bis zum 28.08.2026 war das ein eigener Bereich.',
    ],
  },
  {
    tab: 'friends',
    intro:
      'Dein Profilbild: eine Galerie gezeichneter Grünerator-Figuren, aus der du deinen „Friend" wählst. Er erscheint überall dort, wo du auftauchst — in Chats, Projekten und Kommentaren.',
    extras: [
      'Solange die Einrichtung läuft, stehen drei zur Wahl — Feuri, Robosam und Schildi. Die übrige Truppe kommt dazu, sobald du sie abgeschlossen hast.',
      'Ein Klick auf eine Figur übernimmt sie sofort; ein Foto-Upload ist nicht vorgesehen.',
      'Wolki ist zunächst gesperrt und wird freigeschaltet, sobald du deine Grüne Wolke verbunden hast.',
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
    tab: 'briefe',
    intro:
      'Absenderangaben für den PDF-Export von Briefen. Du kannst mehrere Briefköpfe anlegen — etwa einen für den Kreisverband und einen für die Fraktion — und beim Export auswählen, welcher oben links erscheint.',
    extras: [
      'Genau ein Briefkopf ist der Standard; der Export schlägt ihn vor. Löschst du den Standard, rückt automatisch ein anderer nach.',
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
    tab: 'tagesbriefing',
    intro:
      'Ob dir der Grünerator beim ersten Besuch des Tages zuerst schreibt. Das Tagesbriefing ist aus, bis du es einschaltest, und braucht deine Einwilligung in die KI-Verarbeitung.',
    extras: [
      'Es erscheint als neuer Chat in der Seitenleiste: deine offenen Aufgaben aus den Boards, Schlagzeilen aus Partei und Welt mit Quelle, ein Rückblick auf deine Arbeit und zwei bis vier Ideen für heute.',
      'Ein Briefing, auf das du nicht geantwortet hast, wird am nächsten Tag durch das neue ersetzt.',
    ],
  },
  {
    tab: 'benachrichtigungen',
    intro:
      'Worüber und wie du informiert wirst. Am einfachsten wählst du eine der drei Stufen; wer es genauer mag, schaltet jede Meldungsart einzeln pro Kanal.',
  },
  {
    tab: 'konnektoren',
    intro:
      'Alles, was der Grünerator von außen lesen darf, an einer Stelle: deine Grüne Wolke, weitere Dienste für den Chat und die Websites deines Verbands.',
    extras: [
      '**Grüne Wolke**: Über einen Freigabe-Link liest der Grünerator die Dateien eines Ordners — im Chat per Erwähnung, in Notebooks und im Docs-Editor. Er liest nur, er schreibt nichts zurück. Ein Assistent führt durch die Einrichtung.',
      '**Weitere Dienste** (experimentell): Externe Dienste, die du im Chat per @-Erwähnung ansprichst. Darunter stehen die Werkzeuge, die du dauerhaft ohne Rückfrage erlaubt hast.',
      '**Meine Websites**: WordPress-Seiten verbinden, damit ihre Beiträge in Notebooks zur Verfügung stehen — etwa die Seite deines Kreisverbands. Die Kategorien werden einmal abgefragt und stehen danach überall zur Auswahl.',
      'Die Links **/settings/wolke** und **/settings/websites** führen weiterhin hierher — bis zum 11.11.2026 waren das eigene Bereiche.',
    ],
  },
  {
    tab: 'nutzung',
    intro:
      'Dein Stand heute und was du mit dem Grünerator gemacht hast: oben die Bäume, darunter deine Werke über die gesamte Zeit und der KI-Verbrauch der letzten 7, 30 oder 90 Tage — Anfragen, Bilder, Transkriptionen, Web-Recherchen und Sprachausgabe.',
    extras: [
      '**Bäume** sind dein tägliches Guthaben für alles, was spürbar Rechenleistung braucht: KI-Bilder, Grünerator Voice, den Übersetzer und die Tiefenrecherche. Jedes Konto hat 10 Bäume am Tag; sie werden um Mitternacht (UTC) zurückgesetzt, angezeigt in deiner Ortszeit.',
      'Wer den Grünerator-Newsletter abonniert hat, bekommt 5 Bäume mehr — 15 statt 10. Das zählt nur, wenn die abonnierte Adresse dieselbe ist wie die deines Grünerator-Kontos.',
      'Ein Baum entspricht einem KI-Bild mit dem Standardmodell (0,5 beim kleinen, 2 beim großen), 3 Minuten Sprachausgabe, 20.000 Zeichen Übersetzung (2,5 für ein ganzes Dokument) oder einer Tiefenrecherche. Auf manchen Instanzen (etwa bgst) ist das Kontingent unbegrenzt.',
      'Der Vergleich mit ChatGPT zeigt, wie viel CO₂ und Strom dieselbe Textarbeit dort gekostet hätte; „So rechnen wir" klappt die Herleitung auf. Welche Modelle und Anbieter dahinter arbeiten, steht auf der Transparenz-Seite, nicht hier.',
      'Hier gibt es nichts einzustellen — der Bereich zeigt nur an. Automatische Hintergrundprozesse zählen nicht mit. Der Link **/settings/baeume** führt weiterhin hierher.',
    ],
  },
  {
    tab: 'support',
    intro:
      'Kontaktwege, wenn etwas klemmt oder dir etwas fehlt: der Chat-Kanal der Community und eine E-Mail-Adresse. Hier gibt es nichts einzustellen.',
  },
];
