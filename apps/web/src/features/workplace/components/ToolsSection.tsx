import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { getIcon } from '../../../config/icons';

import type { IconType } from '../../../config/icons';

interface ToolItem {
  id: string;
  title: string;
  path: string;
  icon: IconType;
  betaFeature?: string;
}

const ALL_TOOLS: ToolItem[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    path: '/datenbank/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'gruen-veraendern',
    title: 'Bild begrünen',
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
    id: 'recherche',
    title: 'Recherche',
    path: '/recherche',
    icon: getIcon('navigation', 'suche')!,
  },
  {
    id: 'scanner',
    title: 'Seite scannen',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner')!,
    betaFeature: 'scanner',
  },
  {
    id: 'transkription',
    title: 'Audio transkribieren',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
    betaFeature: 'scanner',
  },
];

const ToolIcon = memo(({ tool }: { tool: ToolItem }) => {
  const navigate = useNavigate();
  const Icon = tool.icon;

  return (
    <button
      type="button"
      className="flex flex-col items-center gap-sm cursor-pointer bg-transparent border-none p-0 group"
      onClick={() => navigate(tool.path)}
    >
      <div className="flex items-center justify-center size-16 rounded-full bg-secondary-100 dark:bg-grey-700 text-secondary-600 dark:text-grey-200 transition-all duration-200 group-hover:bg-secondary-200 dark:group-hover:bg-grey-600 group-hover:scale-105 shadow-sm">
        <Icon className="text-2xl" />
      </div>
      <span className="text-sm text-foreground text-center leading-tight max-w-20 line-clamp-2">
        {tool.title}
      </span>
    </button>
  );
});
ToolIcon.displayName = 'ToolIcon';

const ToolsSection = React.memo(
  ({ canAccessBetaFeature }: { canAccessBetaFeature: (feature: string) => boolean }) => {
    const visibleTools = useMemo(
      () => ALL_TOOLS.filter((tool) => !tool.betaFeature || canAccessBetaFeature(tool.betaFeature)),
      [canAccessBetaFeature]
    );

    return (
      <section className="mb-xl">
        <div className="flex justify-center gap-xl flex-wrap py-sm">
          {visibleTools.map((tool) => (
            <ToolIcon key={tool.id} tool={tool} />
          ))}
        </div>
      </section>
    );
  }
);

ToolsSection.displayName = 'ToolsSection';

export default ToolsSection;
