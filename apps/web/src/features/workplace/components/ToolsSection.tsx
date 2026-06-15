import { IconButton } from '@gruenerator/ui';
import React from 'react';
import { RiSpyLine } from 'react-icons/ri';
import { useNavigate } from 'react-router-dom';

import { getIcon } from '../../../config/icons';

import type { IconType } from '../../../config/icons';

interface ToolItem {
  id: string;
  title: string;
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
    path: '/agentura',
    icon: RiSpyLine,
  },
  {
    id: 'monitor',
    title: 'Monitor',
    path: '/monitor',
    icon: getIcon('navigation', 'monitor')!,
    devOnly: true,
  },
  {
    id: 'gruen-veraendern',
    title: 'Bild mit KI begrünen',
    path: '/studio/ki/green-edit',
    icon: getIcon('navigation', 'imagine')!,
  },
  {
    id: 'reels-untertitel',
    title: 'Reel untertiteln',
    path: '/studio/video',
    icon: getIcon('navigation', 'reel')!,
  },
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    path: '/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'transfer',
    title: 'Transfer',
    path: '/transfer',
    icon: getIcon('actions', 'upload')!,
    devOnly: true,
  },
  {
    id: 'scanner',
    title: 'Text digitalisieren',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner')!,
  },
  {
    id: 'transkription',
    title: 'Audio mit KI transkribieren',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
  },
  {
    id: 'apps',
    title: 'Mit ChatGPT & co verbinden',
    path: '/apps',
    icon: getIcon('actions', 'link')!,
  },
];

const FAVORITES: FavoriteItem[] = [
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

// Uniform tool cells: reserve a fixed two-line label height and clamp to two
// lines (targets the IconButton's label span — its only direct `span` child; the
// icon span is nested inside the circle). Without this, labels wrap to 1–3 lines
// and the round buttons end up at different heights. `max-w-32` lets the longest
// labels ("Audio mit KI transkribieren") fit two lines instead of three.
const TOOL_LABEL_CLASS = '[&>span]:line-clamp-2 [&>span]:min-h-[2.5rem] [&>span]:max-w-32';

function IconGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] justify-items-center gap-xl px-md md:px-lg">
      {children}
    </div>
  );
}

function ToolIconRow({ tools }: { tools: ToolItem[] }) {
  const navigate = useNavigate();
  return (
    <IconGrid>
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <IconButton
            key={tool.id}
            size="lg"
            icon={<Icon />}
            label={tool.title}
            className={TOOL_LABEL_CLASS}
            onClick={() => navigate(tool.path)}
          />
        );
      })}
    </IconGrid>
  );
}

function FavoriteIconRow({ favorites }: { favorites: FavoriteItem[] }) {
  return (
    <IconGrid>
      {favorites.map((fav) => {
        const Icon = fav.icon;
        return (
          <IconButton
            key={fav.id}
            size="lg"
            icon={<Icon />}
            label={fav.title}
            className={TOOL_LABEL_CLASS}
            onClick={() => window.open(fav.href, '_blank', 'noopener,noreferrer')}
          />
        );
      })}
    </IconGrid>
  );
}

const ToolsSection = React.memo(() => {
  const tools = filterTools(MAIN_TOOLS);
  return <ToolIconRow tools={tools} />;
});

ToolsSection.displayName = 'ToolsSection';

export const FavoritesSection = React.memo(() => <FavoriteIconRow favorites={FAVORITES} />);

FavoritesSection.displayName = 'FavoritesSection';

export default ToolsSection;
