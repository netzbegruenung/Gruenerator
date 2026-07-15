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

// The office suite, surfaced as its own "Office" row on the Arbeiten tab. Same
// tile shape as WORKPLACE_TOOLS so it renders identically; each points at its
// type-scoped landing page.
export const OFFICE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'docs',
    title: 'Docs',
    description: 'Dokumente schreiben',
    path: '/docs',
    icon: getIcon('navigation', 'docs')!,
  },
  {
    id: 'boards',
    title: 'Boards',
    description: 'Planen & organisieren',
    path: '/boards',
    icon: getIcon('navigation', 'boards')!,
  },
  {
    id: 'sheets',
    title: 'Tabellen',
    description: 'Daten & Kalkulationen',
    path: '/sheets',
    icon: getIcon('navigation', 'sheets')!,
  },
  {
    id: 'presentations',
    title: 'Präsentationen',
    description: 'Folien & Vorträge',
    path: '/presentations',
    icon: getIcon('navigation', 'presentations')!,
  },
  {
    id: 'canvas',
    title: 'Canvas',
    description: 'Grafiken für Social',
    path: '/canvas',
    icon: getIcon('navigation', 'sharepic')!,
  },
];

// Tools surfaced on the /canvas page, pulled from the studio/imagine routes.
export const CANVAS_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'canvas-vorlagen',
    title: 'Vorlagen',
    description: 'Design-Vorlagen',
    path: '/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'canvas-ki-bearbeiten',
    title: 'Bild bearbeiten',
    description: 'Fotos mit KI ändern',
    path: '/imagine/universal-edit',
    icon: getIcon('actions', 'edit')!,
  },
  {
    id: 'canvas-ki-erstellen',
    title: 'Bild erstellen',
    description: 'KI-Bild generieren',
    path: '/imagine/pure-create',
    icon: getIcon('navigation', 'imagine')!,
  },
  {
    id: 'canvas-sharepics',
    title: 'Sharepics',
    description: 'Grafiken gestalten',
    path: '/studio/templates',
    icon: getIcon('navigation', 'sharepic')!,
  },
];

const NEWSLETTER_URL =
  'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW';

// The "Tools" row link tiles. Utility tools are grouped into the dropdown cards
// below (TOOL_MENUS) to keep the row compact.
export const WORKPLACE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'Agent*innen & Skills',
    path: '/agentura',
    icon: RiSpyLine,
  },
  {
    id: 'reels-untertitel',
    title: 'Reels',
    description: 'Untertitel für Clips',
    path: '/studio/video',
    icon: getIcon('navigation', 'reel')!,
  },
];

// Dropdown tool cards, rendered after the link tiles in the "Tools" row.
export const TOOL_MENUS: WorkplaceToolMenu[] = [
  {
    id: 'verbinden',
    title: 'Verbinden',
    description: 'Newsletter & MCP',
    icon: getIcon('actions', 'link')!,
    items: [
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
export function sortToolsByFavourites(
  tools: WorkplaceToolItem[],
  favouriteIds: string[]
): WorkplaceToolItem[] {
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
