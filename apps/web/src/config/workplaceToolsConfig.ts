import { RiSpyLine } from 'react-icons/ri';

import { getIcon } from './icons';

import type { IconType } from './icons';

export interface WorkplaceToolItem {
  id: string;
  title: string;
  description: string;
  /** Internal route (rendered as a router Link). Mutually exclusive with `href`. */
  path?: string;
  /** External URL (rendered as a new-tab anchor). Mutually exclusive with `path`. */
  href?: string;
  icon: IconType;
  devOnly?: boolean;
}

/** A single entry inside a dropdown tool card. Rendered as a tool-card row. */
export interface WorkplaceToolMenuItem {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  /** Internal route. Mutually exclusive with `href`. */
  path?: string;
  /** External URL (opened in a new tab). Mutually exclusive with `path`. */
  href?: string;
}

/** A tool card that opens a dropdown of related tools instead of navigating. */
export interface WorkplaceToolMenu {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  items: WorkplaceToolMenuItem[];
}

// The office suite, now bundled behind a single "Office" group tile on the
// Arbeiten tab (mirroring how "Bilder & Videos" fronts the /studio sub-tools).
// The four apps live in OFFICE_SUITE_TOOLS and are surfaced on the /office
// landing page.
export const OFFICE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'office',
    title: 'Office',
    description: 'Dokumente, Boards, Tabellen & Slides',
    path: '/office',
    icon: getIcon('navigation', 'desk')!,
  },
  {
    id: 'canvas',
    title: 'Studio',
    description: 'KI-Bilder, Sharepics & Reels',
    path: '/studio',
    icon: getIcon('navigation', 'sharepic')!,
  },
  {
    id: 'wissen',
    title: 'Wissen',
    description: 'Recherche & Notebooks',
    path: '/wissen',
    icon: getIcon('navigation', 'notebooks')!,
  },
];

/** What an office-suite tile does when clicked: create a blank resource, or open
 * the template gallery. */
export type OfficeCreateKind = 'doc' | 'board' | 'sheet' | 'pres' | 'gallery';

/** An action tile on the /office landing page. Unlike WorkplaceToolItem these
 * don't navigate to a page — they create an empty resource (or open the template
 * gallery) in place. `id` doubles as the toolTheme key so each keeps its colour. */
export interface OfficeSuiteTool {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  create: OfficeCreateKind;
}

// The office action tiles on the /office landing page: "Vorlagen" opens the
// template gallery; the rest create an empty document/board/sheet/presentation
// and open its editor directly (see DocumentsContent's officeToolStrip). `id`
// matches the toolTheme key so each tile keeps its colour.
export const OFFICE_SUITE_TOOLS: OfficeSuiteTool[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Aus Vorlage starten',
    icon: getIcon('navigation', 'vorlagen')!,
    create: 'gallery',
  },
  {
    id: 'docs',
    title: 'Leeres Dokument',
    description: 'Leeres Textdokument',
    icon: getIcon('navigation', 'docs')!,
    create: 'doc',
  },
  {
    id: 'boards',
    title: 'Leeres Board',
    description: 'Leeres Kanban-Board',
    icon: getIcon('navigation', 'boards')!,
    create: 'board',
  },
  {
    id: 'sheets',
    title: 'Leere Tabelle',
    description: 'Leere Kalkulationstabelle',
    icon: getIcon('navigation', 'sheets')!,
    create: 'sheet',
  },
  {
    id: 'presentations',
    title: 'Leere Präsentation',
    description: 'Leere Foliensammlung',
    icon: getIcon('navigation', 'presentations')!,
    create: 'pres',
  },
];

// Tools surfaced on the /studio (Bilder & Videos) landing page. KI-Bilder now
// lives in the unified Bild-Editor; Reels moved here from the Arbeiten tab.
export const CANVAS_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'canvas-vorlagen',
    title: 'Vorlagen',
    description: 'Design-Vorlagen',
    path: '/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'canvas-ki',
    title: 'KI-Bilder',
    description: 'Erstellen & bearbeiten',
    path: '/bild-editor',
    icon: getIcon('navigation', 'imagine')!,
  },
  {
    id: 'canvas-sharepics',
    title: 'Sharepics',
    description: 'Grafiken gestalten',
    path: '/studio/templates',
    icon: getIcon('navigation', 'sharepic')!,
  },
  {
    id: 'reels-untertitel',
    title: 'Reels',
    description: 'Untertitel für Clips',
    path: '/studio/video',
    icon: getIcon('navigation', 'reel')!,
  },
];

const NEWSLETTER_URL =
  'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW';

// Creation tools that join the colored "Office" strip on the Arbeiten tab.
// (Reels moved to the /studio "Bilder & Videos" landing; "Bilder & Videos"
// covers KI-Bilder, Sharepics and Reels now.)
export const WORKPLACE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'Grüneratoren & Skills',
    path: '/agentura',
    icon: RiSpyLine,
  },
  {
    id: 'spaces',
    title: 'Spaces',
    description: 'Chats & Inhalte bündeln',
    path: '/gruppen',
    icon: getIcon('navigation', 'gruppen')!,
  },
];

// Single "Weitere" dropdown tile (Verbinden merged in) — the utility tools plus
// the connect options under one roof. Rendered as a tile in the Office strip.
export const TOOL_MENUS: WorkplaceToolMenu[] = [
  {
    id: 'weitere',
    title: 'Weitere',
    description: 'Mehr Werkzeuge',
    icon: getIcon('navigation', 'tools')!,
    items: [
      {
        id: 'scanner',
        title: 'Scanner',
        description: 'Fotos & Scans zu Text',
        path: '/scanner',
        icon: getIcon('navigation', 'scanner')!,
      },
      {
        id: 'zeichenzaehler',
        title: 'Zeichenzähler',
        description: 'Wörter zählen',
        path: '/zeichenzaehler',
        icon: getIcon('navigation', 'zeichenzaehler')!,
      },
      {
        id: 'transkription',
        title: 'Transkription',
        description: 'Audio zu Text',
        path: '/transkription',
        icon: getIcon('navigation', 'transkription')!,
      },
      {
        id: 'newsletter',
        title: 'Newsletter',
        description: 'Updates abonnieren',
        href: NEWSLETTER_URL,
        icon: getIcon('navigation', 'presse-social')!,
      },
      {
        id: 'mcp',
        title: 'MCP',
        description: 'ChatGPT & Co verbinden',
        path: '/apps',
        icon: getIcon('actions', 'link')!,
      },
    ],
  },
];

export function filterWorkplaceTools(tools: WorkplaceToolItem[]): WorkplaceToolItem[] {
  return tools.filter((tool) => !tool.devOnly || import.meta.env.DEV);
}

/** A tool can be pinned to the sidebar only if it has an internal route. */
export function isFavouritableTool(tool: WorkplaceToolItem): tool is WorkplaceToolItem & {
  path: string;
} {
  return Boolean(tool.path) && !tool.href;
}

/**
 * Favourited tools float to the front, ordered by when they were pinned; the
 * rest keep their curated order. Stable within each group.
 */
export function sortToolsByFavourites<T extends { id: string }>(
  tools: T[],
  favouriteIds: string[]
): T[] {
  const favRank = new Map(favouriteIds.map((id, index) => [id, index]));
  return tools
    .map((tool, index) => ({ tool, index }))
    .sort((a, b) => {
      const aFav = favRank.get(a.tool.id) ?? Infinity;
      const bFav = favRank.get(b.tool.id) ?? Infinity;
      return aFav - bFav || a.index - b.index;
    })
    .map((entry) => entry.tool);
}
