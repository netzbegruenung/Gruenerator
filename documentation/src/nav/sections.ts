// Single source for the docs' presentation layer: the startpage grid,
// the navbar and the footer are all built from this file. Every link here
// ends up in a rendered page, so `onBrokenLinks: 'throw'` turns a stale
// entry into a build failure — keep ids matching the docs/ folder names
// and sidebarIds matching sidebars.ts.
// Node-safe on purpose (imported by docusaurus.config.ts): data only.

export type DocSection = {
  /** Matches the folder name under docs/. */
  id: string;
  label: string;
  icon: string;
  description: string;
  /** The page a startpage card and the category redirect land on. */
  intro: string;
  /** Matches a key in sidebars.ts. */
  sidebarId: string;
  /** 'direct' = own navbar entry, 'more' = inside the "Mehr" dropdown. */
  navbar: 'direct' | 'more';
  /**
   * Position among the 'direct' navbar entries, lowest first. Entries without
   * one keep their array order behind those that have one.
   *
   * Separate from the array order on purpose: this list also drives the
   * startpage grid and the footer, where the reading order is a different
   * question from what belongs leftmost in the header.
   */
  navbarOrder?: number;
  topPages: { label: string; to: string }[];
};

export const SECTIONS: DocSection[] = [
  {
    id: 'ueber-den-gruenerator',
    label: 'Über den Grünerator',
    icon: '🎯',
    description: 'Was der Grünerator ist, welche Werkzeuge es gibt und worauf er aufbaut.',
    intro: '/docs/ueber-den-gruenerator/intro',
    sidebarId: 'ueberSidebar',
    navbar: 'more',
    topPages: [
      { label: 'Einführung', to: '/docs/ueber-den-gruenerator/intro' },
      { label: 'Alle Werkzeuge', to: '/docs/ueber-den-gruenerator/tools' },
      {
        label: 'Wie nachhaltig ist der Grünerator?',
        to: '/docs/ueber-den-gruenerator/nachhaltigkeit',
      },
      { label: 'Deine Daten im Grünerator', to: '/docs/ueber-den-gruenerator/notebook' },
      { label: 'Barrierefreiheit', to: '/docs/ueber-den-gruenerator/barrierefreiheit' },
      {
        label: 'Wie diese Doku entsteht',
        to: '/docs/ueber-den-gruenerator/wie-diese-doku-entsteht',
      },
    ],
  },
  {
    id: 'guides',
    label: 'Guides',
    icon: '🧭',
    description:
      'Kurze Schritt-für-Schritt-Anleitungen für einzelne Aufgaben, sortiert nach Erfahrungsstand.',
    intro: '/docs/guides/intro',
    sidebarId: 'guidesSidebar',
    navbar: 'direct',
    navbarOrder: 2,
    topPages: [
      { label: 'Was Guides sind', to: '/docs/guides/intro' },
      {
        label: 'Wie schreibe ich einen Social Media Beitrag?',
        to: '/docs/guides/einsteigerinnen/social-media-beitrag',
      },
      {
        label: 'Wie erstelle ich einen Antrag?',
        to: '/docs/guides/einsteigerinnen/antrag-stadtrat',
      },
      {
        label: 'Wie binde ich die Grüne Wolke ein?',
        to: '/docs/guides/fortgeschrittene/gruene-wolke-einbinden',
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: '✨',
    description:
      'Im Gespräch arbeiten: fragen, recherchieren, Dateien mitgeben, Inhalte erstellen.',
    intro: '/docs/chat/ki-chat',
    sidebarId: 'chatSidebar',
    navbar: 'direct',
    topPages: [
      { label: 'Was kann ich fragen?', to: '/docs/chat/was-kann-ich-fragen' },
      { label: 'KI-Modelle', to: '/docs/chat/ki-modelle' },
      { label: 'Dateien hinzufügen', to: '/docs/chat/dateien-hinzufuegen' },
    ],
  },
  {
    id: 'features',
    label: 'Features',
    icon: '📄',
    description:
      'Office, die Agentura und die Inhalte der Landesverbände — was der Grünerator neben dem Chat kann.',
    intro: '/docs/features/intro',
    sidebarId: 'featuresSidebar',
    navbar: 'direct',
    topPages: [
      { label: 'Überblick', to: '/docs/features/intro' },
      { label: 'Office', to: '/docs/features/office' },
      { label: 'Agentura', to: '/docs/features/agentura' },
      { label: 'Notebooks', to: '/docs/features/notebooks' },
      { label: 'Landesverbände', to: '/docs/features/landesverbaende' },
    ],
  },
  {
    id: 'konto',
    label: 'Konto & Projekte',
    icon: '👤',
    description: 'Projekte, Einstellungen und die Einrichtung für deinen Landesverband.',
    intro: '/docs/konto/projekte',
    sidebarId: 'kontoSidebar',
    navbar: 'more',
    topPages: [
      { label: 'Projekte', to: '/docs/konto/projekte' },
      { label: 'Einstellungen', to: '/docs/konto/einstellungen' },
      {
        label: 'Für deinen Landesverband einrichten',
        to: '/docs/konto/landesverband-einrichten',
      },
    ],
  },
  {
    id: 'integrationen',
    label: 'Integrationen',
    icon: '🔌',
    description: 'Den Grünerator mit anderen Diensten verbinden — in beide Richtungen.',
    intro: '/docs/integrationen/konnektoren',
    sidebarId: 'integrationenSidebar',
    navbar: 'more',
    topPages: [
      { label: 'Konnektoren', to: '/docs/integrationen/konnektoren' },
      { label: 'KI-Chat einrichten', to: '/docs/integrationen/ki-chat-einrichten' },
      { label: 'Was kann der MCP-Server?', to: '/docs/integrationen/mcp-was-kann-ich-fragen' },
      { label: 'Grünerator für Chrome', to: '/docs/integrationen/chrome-erweiterung' },
    ],
  },
  {
    id: 'sonstiges',
    label: 'Sonstiges',
    icon: '🗃️',
    description: 'Was in keinen der anderen Bereiche gehört.',
    intro: '/docs/sonstiges/inhaltsdatenbank',
    sidebarId: 'sonstigesSidebar',
    navbar: 'more',
    topPages: [{ label: 'Inhaltsdatenbank', to: '/docs/sonstiges/inhaltsdatenbank' }],
  },
  {
    id: 'grundlagen',
    label: 'Grundlagen',
    icon: '🧠',
    description:
      'Wie KI-Sprachmodelle funktionieren, wo ihre Grenzen liegen, wie man kennzeichnet.',
    intro: '/docs/grundlagen/wie-llms-funktionieren',
    sidebarId: 'grundlagenSidebar',
    navbar: 'direct',
    navbarOrder: 1,
    topPages: [
      { label: 'Wie LLMs funktionieren', to: '/docs/grundlagen/wie-llms-funktionieren' },
      { label: 'Risiken & Gefahren', to: '/docs/grundlagen/risiken-und-gefahren-von-llms' },
      { label: 'Kennzeichnungs-Guide', to: '/docs/grundlagen/Kennzeichnungs-Guide' },
    ],
  },
];

export type QuickTask = { label: string; description: string; to: string };

export const QUICK_TASKS: QuickTask[] = [
  {
    label: 'Fragen stellen & Texte schreiben',
    description: 'Anträge, Reden und Pressemitteilungen direkt im Chat entwerfen.',
    to: '/docs/chat/was-kann-ich-fragen',
  },
  {
    label: 'Gemeinsam an einem Dokument arbeiten',
    description: 'Texte in Echtzeit zu mehreren schreiben, teilen und versionieren.',
    to: '/docs/features/dokumente',
  },
  {
    label: 'Eine Präsentation bauen',
    description: 'Folien anlegen, gestalten und als PDF oder PPTX exportieren.',
    to: '/docs/features/praesentationen',
  },
  {
    label: 'Für deinen Landesverband einrichten',
    description: 'Einmal die Rolle hinterlegen — danach kennt der Grünerator euren Stil.',
    to: '/docs/konto/landesverband-einrichten',
  },
  {
    label: 'Eigenes Wissen anlegen',
    description: 'Ein Notebook mit euren Dokumenten und Webseiten füttern.',
    to: '/docs/guides/einsteigerinnen/eigenes-notebook-erstellen',
  },
  {
    label: 'Mit anderen Tools verbinden',
    description: 'Konnektoren einrichten — vom Kalender bis zur Grünen Wolke.',
    to: '/docs/integrationen/konnektoren',
  },
];

// Small utilities that don't fit the section grid.
export const EXTRA_LINKS = {
  webinare: { label: 'Webinare', to: '/docs/webinare' },
  archiv: { label: 'Archiv', to: '/docs/category/newsletter' },
  bildnachweise: { label: 'Bildnachweise', to: '/docs/bildnachweise' },
} as const;
