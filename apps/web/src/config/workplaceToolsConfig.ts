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
];

export const WORKPLACE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'Agent*innen & Skills',
    path: '/agentura',
    icon: RiSpyLine,
  },
  {
    id: 'gruen-veraendern',
    title: 'Bild begrünen',
    description: 'Fotos grüner machen',
    path: '/studio/ki/green-edit',
    icon: getIcon('navigation', 'imagine')!,
  },
  {
    id: 'reels-untertitel',
    title: 'Reel untertiteln',
    description: 'Untertitel für Clips',
    path: '/studio/video',
    icon: getIcon('navigation', 'reel')!,
  },
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Fertige Design-Vorlagen',
    path: '/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'scanner',
    title: 'Text digitalisieren',
    description: 'Fotos & Scans zu Text',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner')!,
  },
  {
    id: 'zeichenzaehler',
    title: 'Zeichenzähler',
    description: 'Zeichen & Wörter zählen',
    path: '/zeichenzaehler',
    icon: getIcon('navigation', 'zeichenzaehler')!,
  },
  {
    id: 'transkription',
    title: 'Audio transkribieren',
    description: 'Meetings verschriftlichen',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
  },
  {
    id: 'apps',
    title: 'Mit ChatGPT verbinden',
    description: 'In ChatGPT & Claude nutzen',
    path: '/apps',
    icon: getIcon('actions', 'link')!,
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
