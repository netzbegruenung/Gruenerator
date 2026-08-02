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
    id: 'office',
    label: 'Office',
    icon: '📄',
    description: 'Dokumente, Tabellen, Präsentationen und Boards — gemeinsam schreiben und planen.',
    intro: '/docs/office/intro',
    sidebarId: 'officeSidebar',
    navbar: 'direct',
    topPages: [
      { label: 'Überblick', to: '/docs/office/intro' },
      { label: 'Tabellen', to: '/docs/office/tabellen' },
      { label: 'Boards', to: '/docs/office/boards' },
    ],
  },
  {
    id: 'wissen',
    label: 'Wissen',
    icon: '📚',
    description: 'Eigene Notebooks anlegen und die Inhalte der Landesverbände nutzen.',
    intro: '/docs/wissen/eigenes-notebook-erstellen',
    sidebarId: 'wissenSidebar',
    navbar: 'direct',
    topPages: [
      { label: 'Eigenes Notebook erstellen', to: '/docs/wissen/eigenes-notebook-erstellen' },
      { label: 'Landesverbände', to: '/docs/wissen/landesverbaende' },
      { label: 'Inhaltsdatenbank', to: '/docs/wissen/inhaltsdatenbank' },
    ],
  },
  {
    id: 'grueneratoren',
    label: 'Grüneratoren',
    icon: '🕵️',
    description: 'Die Agentura: fertige Grüneratoren nutzen und eigene bauen.',
    intro: '/docs/grueneratoren/agentura',
    sidebarId: 'grueneratorenSidebar',
    navbar: 'direct',
    topPages: [
      { label: 'Agentura', to: '/docs/grueneratoren/agentura' },
      {
        label: 'Eigene Grüneratoren erstellen',
        to: '/docs/grueneratoren/eigene-agentinnen-erstellen',
      },
    ],
  },
  {
    id: 'konto',
    label: 'Konto & Projekte',
    icon: '👤',
    description: 'Projekte, Einstellungen und die Anbindung der Grünen Wolke.',
    intro: '/docs/konto/projekte',
    sidebarId: 'kontoSidebar',
    navbar: 'more',
    topPages: [
      { label: 'Projekte', to: '/docs/konto/projekte' },
      { label: 'Einstellungen', to: '/docs/konto/einstellungen' },
      { label: 'Grüne Wolke', to: '/docs/konto/gruene-wolke' },
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
    id: 'grundlagen',
    label: 'Grundlagen',
    icon: '🧠',
    description:
      'Wie KI-Sprachmodelle funktionieren, wo ihre Grenzen liegen, wie man kennzeichnet.',
    intro: '/docs/grundlagen/wie-llms-funktionieren',
    sidebarId: 'grundlagenSidebar',
    navbar: 'direct',
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
    label: 'Social-Media-Post mit Sharepic',
    description: 'Text und Bild für Instagram & Co. in einem Schritt erstellen.',
    to: '/docs/chat/social-media-post',
  },
  {
    label: 'Gemeinsam an einem Dokument arbeiten',
    description: 'Texte in Echtzeit zu mehreren schreiben, teilen und versionieren.',
    to: '/docs/office/dokumente',
  },
  {
    label: 'Eine Präsentation bauen',
    description: 'Folien anlegen, gestalten und als PDF oder PPTX exportieren.',
    to: '/docs/office/praesentationen',
  },
  {
    label: 'Eigenes Wissen anlegen',
    description: 'Ein Notebook mit euren Dokumenten und Webseiten füttern.',
    to: '/docs/wissen/eigenes-notebook-erstellen',
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
