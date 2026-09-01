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
    note: 'Alles Visuelle: KI-Bilder, Sharepics aus Vorlagen und untertitelte Reels. Nimm den Bereich, wenn am Ende ein Bild oder ein Video herauskommen soll — für Text und Zahlen ist Office richtig.',
    platform: ['web', 'desktop', 'mobile'],
  },
  wissen: {
    note: 'Recherche und Notebooks: eigene Quellensammlungen anlegen, durchsuchen und im Chat als Grundlage verwenden. Hier liegt auch der Monitor mit Themen und Umfragen.',
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
  'canvas-ki': {
    note: 'Bilder mit KI erzeugen und bearbeiten. Gut für Motive, für die es kein passendes Foto gibt.',
    platform: ['web', 'desktop', 'mobile'],
  },
  'canvas-sharepics': {
    note: 'Grafiken für Social Media gestalten — Text, Bild und Logo in der richtigen Größe für die jeweilige Plattform.',
    platform: ['web', 'desktop'],
  },
  'reels-untertitel': {
    note: 'Untertitelt Videoclips automatisch und brennt die Untertitel ein. Gedacht für kurze Social-Clips.',
    platform: ['web', 'desktop', 'mobile'],
  },

  // ── Organisieren ──────────────────────────────────────────────────────────
  agents: {
    note: 'Die Agentura: eigene Grüneratoren mit festem Auftrag und eigenen Quellen anlegen, dazu Rezepte für wiederkehrende Schreibaufgaben.',
    platform: ['web', 'desktop', 'mobile'],
    readMore: { label: 'Agentura', href: '/docs/features/agentura' },
  },
  projekte: {
    note: 'Projekte bündeln Chats, Dokumente und Mitglieder zu einem Arbeitszusammenhang — etwa für eine Kampagne oder einen Ortsverband.',
    platform: ['web', 'desktop'],
    readMore: { label: 'Projekte', href: '/docs/konto/projekte' },
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
  transkription: {
    note: 'Verschriftlicht Audioaufnahmen — für Interviews, Sitzungen und Sprachnotizen.',
    platform: ['web', 'desktop', 'mobile'],
  },
  newsletter: {
    note: 'Der Grünerator-Newsletter mit neuen Funktionen und Beispielen. Führt auf ein externes Anmeldeformular.',
    platform: ['web', 'desktop', 'mobile'],
  },
  mcp: {
    note: 'Verbindet den Grünerator mit ChatGPT, Claude oder Le Chat, sodass du dort auf grüne Programme und Beschlüsse zugreifen kannst.',
    platform: ['web', 'desktop'],
    readMore: { label: 'Konnektoren', href: '/docs/integrationen/konnektoren' },
  },
};
