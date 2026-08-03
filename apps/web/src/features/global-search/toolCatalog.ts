/**
 * Curated catalog of the tools a user searches for by name, each with synonyms
 * so "video" or "untertitel" finds Reel, "ocr" finds the Scanner, etc. Many of
 * these have no sidebar entry, so the nav-derived index alone would never
 * surface them.
 *
 * LITERAL MIRROR of the `search` blocks in config/toolRegistry.ts — edit tools
 * THERE first. The docs generators AST-parse this file and require a plain
 * array literal, so CATALOG cannot be derived at runtime; `satisfies` pins the
 * ids to the registry and toolRegistry.vitest.ts asserts the entries deep-equal
 * the registry-derived catalog.
 */
import { isChannelVisibleIn, type InstanceChannel } from '@gruenerator/shared/instances';

import { getIcon } from '../../config/icons';
import { CURRENT_INSTANCE } from '../../config/instance';

import type { IconType } from '../../config/icons';
import type { ToolSearchId } from '../../config/toolRegistry';

export interface ToolCatalogEntry {
  id: string;
  title: string;
  subtitle: string | null;
  path: string;
  icon?: IconType | null;
  keywords: string[];
  channel?: InstanceChannel;
}

const nav = (name: string): IconType | null => getIcon('navigation', name) ?? null;

type RegisteredEntry = ToolCatalogEntry & { id: ToolSearchId };

/**
 * The full mirror, before any instance filtering. Exported so the lockstep test
 * can compare the literal against the registry — comparing the filtered view
 * would silently pass whenever an entry is merely hidden on the test's instance.
 */
export const CATALOG: ToolCatalogEntry[] = [
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
  // Deliberately a bare id (not tool-office) so featureIndex dedupes it against
  // the favourites entry — full rationale at the office entry in toolRegistry.
  {
    id: 'office',
    title: 'Office',
    subtitle: 'Dokumente, Boards, Tabellen & Präsentationen',
    path: '/office',
    icon: nav('desk'),
    keywords: [
      'office',
      'docs',
      'dokumente',
      'dokument',
      'text',
      'schreiben',
      'brief',
      'antrag',
      'boards',
      'board',
      'kanban',
      'planen',
      'aufgaben',
      'todo',
      'whiteboard',
      'tabellen',
      'tabelle',
      'sheet',
      'excel',
      'kalkulation',
      'budget',
      'daten',
      'praesentationen',
      'praesentation',
      'praesi',
      'folien',
      'slides',
      'vortrag',
      'pitch',
      'deck',
    ],
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
    subtitle: 'KI-Grüneratoren & Rezepte entdecken',
    path: '/agentura',
    icon: nav('desk'),
    keywords: ['agentura', 'agent', 'agenten', 'grünerator', 'grueneratoren', 'skills', 'ki'],
  },
  {
    id: 'tool-projekte',
    title: 'Projekte',
    subtitle: 'Chats & Inhalte bündeln, Zusammenarbeit im Team',
    path: '/projekte',
    icon: nav('projekte'),
    keywords: [
      'projekte',
      'projekt',
      'spaces',
      'space',
      'gruppen',
      'gruppe',
      'team',
      'organisation',
      'zusammenarbeit',
    ],
  },
  {
    id: 'tool-transfer',
    title: 'Transfer',
    subtitle: 'Dateien sicher übertragen',
    path: '/transfer',
    icon: getIcon('actions', 'upload') ?? null,
    keywords: ['transfer', 'datei', 'upload', 'senden', 'teilen'],
    channel: 'internal',
  },
] satisfies RegisteredEntry[];

export function getToolCatalog(): ToolCatalogEntry[] {
  return CATALOG.filter((entry) => isChannelVisibleIn(entry.channel, CURRENT_INSTANCE));
}
