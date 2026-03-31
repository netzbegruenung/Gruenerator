import { IconButton, IconButtonRow } from '@gruenerator/ui';
import React, { useMemo } from 'react';
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
    id: 'scanner',
    title: 'Text digitalisieren',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner')!,
    betaFeature: 'scanner',
  },
  {
    id: 'transkription',
    title: 'Audio mit KI transkribieren',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
    betaFeature: 'scanner',
  },
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    path: '/datenbank/vorlagen',
    icon: getIcon('navigation', 'vorlagen')!,
  },
  {
    id: 'recherche',
    title: 'Datenbank durchsuchen',
    path: '/recherche',
    icon: getIcon('navigation', 'datenbank')!,
  },
  {
    id: 'transfer',
    title: 'Transfer',
    path: '/transfer',
    icon: getIcon('actions', 'upload')!,
  },
  {
    id: 'apps',
    title: 'Mit ChatGPT & co verbinden',
    path: '/apps',
    icon: getIcon('actions', 'link')!,
  },
];

const ToolsSection = React.memo(
  ({ canAccessBetaFeature }: { canAccessBetaFeature: (feature: string) => boolean }) => {
    const navigate = useNavigate();

    const visibleTools = useMemo(
      () => ALL_TOOLS.filter((tool) => !tool.betaFeature || canAccessBetaFeature(tool.betaFeature)),
      [canAccessBetaFeature]
    );

    return (
      <IconButtonRow>
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <IconButton
              key={tool.id}
              icon={<Icon />}
              label={tool.title}
              onClick={() => navigate(tool.path)}
            />
          );
        })}
      </IconButtonRow>
    );
  }
);

ToolsSection.displayName = 'ToolsSection';

export default ToolsSection;
