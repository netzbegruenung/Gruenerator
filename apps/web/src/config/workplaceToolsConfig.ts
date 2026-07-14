import { RiRepeatLine, RiSpyLine } from 'react-icons/ri';

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

const NEWSLETTER_URL =
  'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW';

export const WORKPLACE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'KI-Agent*innen & Skills entdecken',
    path: '/agentura',
    icon: RiSpyLine,
  },
  // EXPERIMENTAL — recurring agent tasks management surface.
  {
    id: 'recurring-tasks',
    title: 'Wiederkehrende Aufgaben',
    description: 'Agent*innen regelmäßig automatisch laufen lassen',
    path: '/wiederkehrend',
    icon: RiRepeatLine,
  },
  {
    id: 'monitor',
    title: 'Monitor',
    description: 'Themen und Erwähnungen beobachten',
    path: '/experiments/monitor',
    icon: getIcon('navigation', 'monitor')!,
    devOnly: true,
  },
  {
    id: 'gruen-veraendern',
    title: 'Bild mit KI begrünen',
    description: 'Eigene Fotos grüner machen',
    path: '/studio/ki/green-edit',
    icon: getIcon('navigation', 'imagine')!,
  },
  {
    id: 'reels-untertitel',
    title: 'Reel untertiteln',
    description: 'Untertitel für Social-Clips',
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
    id: 'transfer',
    title: 'Transfer',
    description: 'Dateien sicher übertragen',
    path: '/transfer',
    icon: getIcon('actions', 'upload')!,
    devOnly: true,
  },
  {
    id: 'scanner',
    title: 'Text digitalisieren',
    description: 'Fotos & Scans in Text umwandeln',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner')!,
  },
  {
    id: 'zeichenzaehler',
    title: 'Zeichenzähler',
    description: 'Zeichen, Wörter & Social-Limits zählen',
    path: '/zeichenzaehler',
    icon: getIcon('navigation', 'zeichenzaehler')!,
  },
  {
    id: 'transkription',
    title: 'Audio mit KI transkribieren',
    description: 'Meetings & Interviews verschriftlichen',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
  },
  {
    id: 'apps',
    title: 'Mit ChatGPT & co verbinden',
    description: 'Grünerator in ChatGPT & Claude nutzen',
    path: '/apps',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'newsletter',
    title: 'Newsletter',
    description: 'Updates & Neuigkeiten abonnieren',
    href: NEWSLETTER_URL,
    icon: getIcon('navigation', 'presse-social')!,
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
