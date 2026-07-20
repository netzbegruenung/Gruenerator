/**
 * Curated catalog of the tools a user searches for by name, each with synonyms
 * so "video" or "untertitel" finds Reel, "ocr" finds the Scanner, etc. Many of
 * these have no sidebar entry, so the nav-derived index alone would never
 * surface them.
 */
import { getIcon } from '../../config/icons';

import type { IconType } from '../../config/icons';

export interface ToolCatalogEntry {
  id: string;
  title: string;
  subtitle: string | null;
  path: string;
  icon?: IconType | null;
  keywords: string[];
  devOnly?: boolean;
}

const nav = (name: string): IconType | null => getIcon('navigation', name) ?? null;

const CATALOG: ToolCatalogEntry[] = [
  {
    id: 'tool-reel',
    title: 'Reel',
    subtitle: 'Social-Clips untertiteln',
    path: '/studio/video',
    icon: nav('reel'),
    keywords: ['reel', 'video', 'untertitel', 'subtitle', 'clip', 'social', 'tiktok', 'story'],
  },
  {
    id: 'tool-studio',
    title: 'Studio',
    subtitle: 'Sharepics, KI-Bilder & Videos',
    path: '/studio',
    icon: nav('sharepic'),
    keywords: ['studio', 'sharepic', 'bild', 'grafik', 'design', 'poster', 'kachel'],
  },
  {
    id: 'tool-imagine',
    title: 'KI-Bild erstellen',
    subtitle: 'Bilder mit KI erstellen & bearbeiten',
    path: '/bild-editor',
    icon: nav('imagine'),
    keywords: ['imagine', 'ki-bild', 'bild', 'image', 'foto', 'generieren', 'flux', 'ai', 'editor'],
  },
  {
    id: 'tool-scanner',
    title: 'Scanner',
    subtitle: 'Fotos & Scans in Text umwandeln',
    path: '/scanner',
    icon: nav('scanner'),
    keywords: ['scanner', 'scan', 'ocr', 'text', 'digitalisieren', 'foto', 'dokument'],
  },
  {
    id: 'tool-transkription',
    title: 'Transkription',
    subtitle: 'Audio mit KI verschriftlichen',
    path: '/transkription',
    icon: nav('transkription'),
    keywords: [
      'transkription',
      'transkript',
      'audio',
      'meeting',
      'interview',
      'whisper',
      'sprache',
    ],
  },
  {
    id: 'tool-zeichenzaehler',
    title: 'Zeichenzähler',
    subtitle: 'Zeichen, Wörter & Social-Limits zählen',
    path: '/zeichenzaehler',
    icon: nav('zeichenzaehler'),
    keywords: ['zeichenzaehler', 'zeichen', 'woerter', 'counter', 'limit', 'laenge'],
  },
  {
    id: 'tool-vorlagen',
    title: 'Vorlagen',
    subtitle: 'Fertige Design-Vorlagen',
    path: '/vorlagen',
    icon: nav('vorlagen'),
    keywords: ['vorlagen', 'vorlage', 'template', 'design'],
  },
  // ids/paths mirror the getDirectMenuItems() nav entries so featureIndex
  // dedupes them (catalog is indexed first → its richer keywords win), while
  // each type gets its own synonym set for search.
  {
    id: 'docs',
    title: 'Dokumente',
    subtitle: 'Texte schreiben',
    path: '/docs',
    icon: nav('docs'),
    keywords: ['docs', 'dokument', 'text', 'schreiben', 'brief', 'antrag'],
  },
  {
    id: 'boards',
    title: 'Boards',
    subtitle: 'Planen & organisieren',
    path: '/boards',
    icon: nav('boards'),
    keywords: ['boards', 'board', 'kanban', 'planen', 'aufgaben', 'todo', 'whiteboard'],
  },
  {
    id: 'sheets',
    title: 'Tabellen',
    subtitle: 'Daten & Kalkulationen',
    path: '/sheets',
    icon: nav('sheets'),
    keywords: ['tabellen', 'tabelle', 'sheet', 'excel', 'kalkulation', 'budget', 'daten'],
  },
  {
    id: 'presentations',
    title: 'Präsentationen',
    subtitle: 'Folien & Vorträge',
    path: '/presentations',
    icon: nav('presentations'),
    keywords: ['praesentation', 'praesi', 'folien', 'slides', 'vortrag', 'pitch', 'deck'],
  },
  {
    id: 'tool-notebooks',
    title: 'Notebooks',
    subtitle: 'Wissensmanagement & Recherche',
    path: '/notebooks',
    icon: nav('notebooks'),
    keywords: ['notebooks', 'notebook', 'wissen', 'recherche', 'dokumente'],
  },
  {
    id: 'tool-chat',
    title: 'Chat',
    subtitle: 'KI-Assistent',
    path: '/chat',
    icon: nav('messenger'),
    keywords: ['chat', 'assistent', 'ki', 'gpt', 'frage'],
  },
  {
    id: 'tool-suche',
    title: 'Websuche',
    subtitle: 'Recherche im Netz',
    path: '/suche',
    icon: nav('suche'),
    keywords: ['suche', 'websuche', 'recherche', 'search', 'internet'],
  },
  {
    id: 'tool-agentura',
    title: 'Agentura',
    subtitle: 'KI-Grüneratoren & Skills entdecken',
    path: '/agentura',
    icon: nav('desk'),
    keywords: ['agentura', 'agent', 'agenten', 'grünerator', 'grueneratoren', 'skills', 'ki'],
  },
  {
    id: 'tool-gruppen',
    title: 'Gruppen',
    subtitle: 'Zusammenarbeit im Team',
    path: '/gruppen',
    icon: nav('gruppen'),
    keywords: ['gruppen', 'gruppe', 'team', 'organisation', 'zusammenarbeit'],
  },
  {
    id: 'tool-transfer',
    title: 'Transfer',
    subtitle: 'Dateien sicher übertragen',
    path: '/transfer',
    icon: getIcon('actions', 'upload') ?? null,
    keywords: ['transfer', 'datei', 'upload', 'senden', 'teilen'],
    devOnly: true,
  },
];

export function getToolCatalog(includeDevOnly: boolean): ToolCatalogEntry[] {
  return includeDevOnly ? CATALOG : CATALOG.filter((entry) => !entry.devOnly);
}
