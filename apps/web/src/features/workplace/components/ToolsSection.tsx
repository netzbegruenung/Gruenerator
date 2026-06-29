import React from 'react';
import { RiSpyLine } from 'react-icons/ri';
import { Link } from 'react-router-dom';

import { getIcon } from '../../../config/icons';

import type { IconType } from '../../../config/icons';

interface ToolItem {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: IconType;
  devOnly?: boolean;
}

interface FavoriteItem {
  id: string;
  title: string;
  href: string;
  icon: IconType;
}

const MAIN_TOOLS: ToolItem[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'Recherche-Agent für grüne Themen',
    path: '/agentura',
    icon: RiSpyLine,
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
];

const NEWSLETTER_URL =
  'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW';

const FAVORITES: FavoriteItem[] = [
  {
    id: 'newsletter',
    title: 'Newsletter',
    href: NEWSLETTER_URL,
    icon: getIcon('navigation', 'presse-social')!,
  },
  {
    id: 'verdigado',
    title: 'Verdigado',
    href: 'https://verdigado.com/',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'sunflower-theme',
    title: 'Sunflower-Theme',
    href: 'https://sunflower-theme.de/',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'gruene-wolke',
    title: 'Grüne Wolke',
    href: 'https://wolke.netzbegruenung.de/',
    icon: getIcon('actions', 'cloud')!,
  },
  {
    id: 'gruenes-doodle',
    title: 'Grünes Doodle',
    href: 'https://termine.netzbegruenung.de',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'netzbegruenung',
    title: 'Netzbegrünung',
    href: 'https://netzbegruenung.de/',
    icon: getIcon('navigation', 'home')!,
  },
];

function filterTools(tools: ToolItem[]): ToolItem[] {
  return tools.filter((tool) => !tool.devOnly || import.meta.env.DEV);
}

// Soft, hover-lift card surface shared by tool tiles and favorite pills. Mirrors
// the workplace's established card idiom (see RecentlyCreatedSection): a hairline
// border + `bg-background` that, on hover, lifts, deepens its shadow and tints its
// border toward the brand eucalyptus. Dark mode swaps to grey borders.
const CARD_BASE =
  'group relative flex items-center bg-background no-underline transition-[transform,box-shadow,border-color] duration-150 ' +
  'border border-grey-200/80 hover:border-secondary-300 hover:shadow-lg dark:border-grey-700/60 dark:hover:border-secondary-700';

// Rounded-square brand chip holding the tool icon. Tints in on hover via the
// shared `group` so the whole tile responds as one surface.
const CHIP_BASE =
  'flex flex-none items-center justify-center rounded-xl text-secondary-600 transition-colors duration-150 ' +
  'group-hover:bg-secondary-50 dark:text-secondary-400 dark:group-hover:bg-secondary-900/30';

function SectionHeading({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="mb-md flex items-center gap-sm">
      <h2 className="m-0 text-xl font-semibold text-foreground-heading">{title}</h2>
      <span className="rounded-full bg-secondary-50 px-2.5 py-0.5 text-xs font-semibold text-secondary-600 dark:bg-secondary-900/30 dark:text-secondary-300">
        {badge}
      </span>
    </div>
  );
}

function ToolTile({ tool }: { tool: ToolItem }) {
  const Icon = tool.icon;
  return (
    <Link to={tool.path} className={`${CARD_BASE} gap-3 rounded-2xl p-md`}>
      <span className={`${CHIP_BASE} size-12 text-[22px]`}>
        <Icon />
      </span>
      <span className="min-w-0">
        <h3 className="m-0 text-[15px] font-semibold leading-tight text-foreground-heading">
          {tool.title}
        </h3>
        <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

function FavoriteTile({ favorite }: { favorite: FavoriteItem }) {
  const Icon = favorite.icon;
  return (
    <a
      href={favorite.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${CARD_BASE} gap-3 rounded-xl px-4 py-3 hover:-translate-y-0.5`}
    >
      <span className={`${CHIP_BASE} size-9 rounded-lg text-[19px]`}>
        <Icon />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground-heading">
        {favorite.title}
      </span>
    </a>
  );
}

const ToolsSection = React.memo(() => {
  const tools = filterTools(MAIN_TOOLS);
  return (
    <>
      <SectionHeading title="Weitere Tools" badge={`${tools.length} Werkzeuge`} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-sm">
        {tools.map((tool) => (
          <ToolTile key={tool.id} tool={tool} />
        ))}
      </div>
    </>
  );
});

ToolsSection.displayName = 'ToolsSection';

export const FavoritesSection = React.memo(() => (
  <>
    <SectionHeading title="Grünerators Favoriten" badge="Externe Dienste" />
    <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-sm">
      {FAVORITES.map((favorite) => (
        <FavoriteTile key={favorite.id} favorite={favorite} />
      ))}
    </div>
  </>
));

FavoritesSection.displayName = 'FavoritesSection';

export default ToolsSection;
