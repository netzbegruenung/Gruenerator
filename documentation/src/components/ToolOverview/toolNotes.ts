/**
 * The hand-written half of the tool overview: what each tool is *for*, and when
 * you'd pick it over a neighbouring one.
 *
 * The other half — which tools exist, what they are called, where they live —
 * comes from src/generated/tools.json, generated from the app's own configs.
 * index.tsx joins the two. A tool missing here simply doesn't get a note, and
 * `tools:audit` files a GitHub issue naming it. So a new tool never breaks a
 * build, but it doesn't stay undescribed in silence either.
 *
 * `platform` is deliberately hand-maintained: web, mobile and desktop keep
 * separate route tables, and inferring availability from file paths would be
 * guesswork that reads as fact. The audit demands it rather than assuming it.
 */

export type Platform = 'web' | 'mobile' | 'desktop';

export interface ToolNote {
  /** One or two sentences: what it does for you, in plain German. */
  note: string;
  /** Where it actually runs. */
  platform: Platform[];
  /** Optional pointer to the article that explains it in depth. */
  readMore?: { label: string; href: string };
}

export const TOOL_NOTES: Record<string, ToolNote> = {
  // ── Die drei Bereiche ─────────────────────────────────────────────────────
  office: {
    note: 'Der Sammelpunkt für alles, woran man schreibt und plant: Dokumente, Boards, Tabellen und Präsentationen. Alle vier liegen im selben System, teilen sich Ordner und Freigaben und lassen sich gemeinsam bearbeiten.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Office', href: '/docs/features/office' },
  },
  canvas: {
    note: 'Alles Visuelle auf einer Seite: oben die Werkzeuge, darunter deine Mediathek mit allen Videos, Sharepics, KI-Bildern, Uploads und Audios — per Ziehen hochladen, filtern, durchsuchen, Titel und Alt-Text pflegen, teilen oder in den Papierkorb legen. Sharepics und KI-Bilder entstehen im Chat und landen von selbst hier.',
    platform: ['web', 'desktop', 'mobile'],
  },
  wissen: {
    note: 'Recherche und Notebooks: eigene Quellensammlungen anlegen, durchsuchen und im Chat als Grundlage verwenden. Von hier aus geht es zum Briefing mit der Lage des Tages und zu den Umfragen.',
    platform: ['web', 'desktop', 'mobile'],
  },

  // ── Office ────────────────────────────────────────────────────────────────
  vorlagen: {
    note: 'Startet ein neues Dokument aus einer fertigen Vorlage statt aus einem leeren Blatt — etwa ein Antrag oder eine Pressemitteilung mit passender Gliederung.',
    platform: ['web', 'desktop'],
  },
  docs: {
    note: 'Ein Textdokument für Anträge, Pressemitteilungen, Protokolle und Notizen. Mehrere Personen können gleichzeitig schreiben.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Dokumente', href: '/docs/features/dokumente' },
  },
  boards: {
    note: 'Ein Kanban-Board für Aufgaben und Redaktionsplanung. Der Grünerator kann in Karten mitarbeiten und ganze Spalten automatisch befüllen.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Boards', href: '/docs/features/boards' },
  },
  sheets: {
    note: 'Eine Kalkulationstabelle mit Formeln, Filtern und bedingter Formatierung. Bestehende Excel- und CSV-Dateien lassen sich importieren.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Tabellen', href: '/docs/features/tabellen' },
  },
  presentations: {
    note: 'Eine Foliensammlung mit Präsentationsmodus. Aus einem Rechercheauftrag im Chat kann direkt ein fertiger Foliensatz entstehen.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Präsentationen', href: '/docs/features/praesentationen' },
  },

  // ── Studio ────────────────────────────────────────────────────────────────
  'canvas-vorlagen': {
    note: 'Fertige Design-Vorlagen im grünen Erscheinungsbild — Ausgangspunkt für Sharepics, wenn du nicht bei null anfangen willst.',
    platform: ['web', 'desktop', 'mobile'],
  },
  'reels-untertitel': {
    note: 'Untertitelt Videoclips automatisch und brennt die Untertitel ein. Gedacht für kurze Social-Clips.',
    platform: ['web', 'desktop', 'mobile'],
  },
  'studio-videoeditor': {
    note: 'Schneidet Clips auf einer Zeitleiste, setzt Texte ins Bild und legt Musik darunter. Nimm ihn, wenn ein Clip mehr braucht als Untertitel. Noch in der Beta.',
    platform: ['web'],
  },

  // ── Studio — Werkzeuge ────────────────────────────────────────────────────
  profilbild: {
    note: 'Macht aus einem Foto ein Profilbild: Person freistellen und den Hintergrund per Klick wechseln — als Farbe, Verlauf, Vorlage oder eigenes Bild. Im Editor setzt du Sticker und verschiebst Person und Sticker direkt im Bild.',
    platform: ['web'],
  },
  sticker: {
    note: 'Sticker und Hintergründe für dein Profilbild: unter „Entdecken“ öffnet sich der Marktplatz mit dem, was andere geteilt haben: liken, merken oder melden. Eigene Sticker bleiben privat, bis du sie mit Bestätigung der Bildrechte öffentlich machst.',
    platform: ['web'],
  },

  // ── Organisieren ──────────────────────────────────────────────────────────
  marktplatz: {
    note: 'Offizielle, Landesverbands- und öffentliche Agents, Rezepte, Vorlagen, Sticker und Hintergründe: stöbern, ausprobieren, zu deinen Grüneratoren holen und Eigenes teilen.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Grüneratoren und Marktplatz', href: '/docs/features/marktplatz' },
  },
  projekte: {
    note: 'Projekte bündeln Chats, Dokumente und Mitglieder zu einem Arbeitszusammenhang — etwa für eine Kampagne oder einen Ortsverband.',
    platform: ['web', 'desktop'],
    readMore: {
      label: 'Wie erstelle ich ein gemeinsames Projekt?',
      href: '/docs/guides/einsteigerinnen/gemeinsames-projekt-erstellen',
    },
  },

  sites: {
    note: 'Eine eigene Website für deine Kandidatur, dein Mandat oder dein Amt: die KI schlägt aus einer kurzen Beschreibung eine fertige Seite vor, im Editor passt du sie an. Pro Konto gibt es eine Website. In der Testphase nur nach Freischaltung.',
    platform: ['web'],
    readMore: { label: 'Sites', href: '/docs/features/sites' },
  },

  // ── Weitere ───────────────────────────────────────────────────────────────
  scanner: {
    note: 'Wandelt Fotos und Scans in bearbeitbaren Text um — praktisch für abfotografierte Anträge oder Handzettel.',
    platform: ['web', 'desktop', 'mobile'],
  },
  zeichenzaehler: {
    note: 'Zählt Zeichen und Wörter, mit den Grenzwerten der gängigen Social-Media-Plattformen.',
    platform: ['web', 'desktop', 'mobile'],
  },
  uebersetzer: {
    note: 'Übersetzt Texte und ganze Dokumente (DOCX, PPTX, PDF …) mit DeepL — das gepflegte Grünen-Glossar wird automatisch angewendet.',
    platform: ['web', 'desktop'],
  },
  voice: {
    note: 'Grünerator Voice verwandelt Text in gesprochene Sprache — als Sprechertext für ein Reel, Ansage für den Anrufbeantworter, Vorlesefassung eines Textes oder Audiodeskription. Die Datei landet in der Mediathek.',
    platform: ['web', 'desktop'],
  },
  transkription: {
    note: 'Verschriftlicht Audioaufnahmen — für Interviews, Sitzungen und Sprachnotizen.',
    platform: ['web', 'desktop', 'mobile'],
  },
  transparenz: {
    note: 'Zeigt, was der Grünerator insgesamt an KI verbraucht — Tokens, Energie und CO₂, mit den Konstanten, mit denen gerechnet wurde. In der Expert*innenübersicht lässt sich nach Bereich (etwa Chat oder Monitor) und nach Eingabe- und Ausgabe-Tokens aufschlüsseln.',
    platform: ['web', 'desktop'],
  },
  newsletter: {
    note: 'Der Grünerator-Newsletter mit neuen Funktionen und Beispielen. Führt auf ein externes Anmeldeformular.',
    platform: ['web', 'desktop', 'mobile'],
  },
  mcp: {
    note: 'Verbindet den Grünerator mit ChatGPT, Claude oder Le Chat, sodass du dort auf grüne Programme und Beschlüsse zugreifen kannst.',
    platform: ['web', 'desktop'],
    readMore: {
      label: 'Wie verbinde ich den Grünerator mit ChatGPT & Co.?',
      href: '/docs/guides/fortgeschrittene/gruenerator-mit-ki-chat-verbinden',
    },
  },
};
