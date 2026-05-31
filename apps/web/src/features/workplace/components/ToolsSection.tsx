import { IconButton } from '@gruenerator/ui';
import React from 'react';
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
    path: '/datenbank/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
    devOnly: true,
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

function IconGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] justify-items-center gap-lg px-md md:px-lg">
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
