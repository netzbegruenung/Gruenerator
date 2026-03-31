import { IconButton, IconButtonRow } from '@gruenerator/ui';
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
    id: 'recherche',
    title: 'Notebook-Daten durchsuchen',
    path: '/recherche',
    icon: getIcon('navigation', 'datenbank')!,
  },
  {
    id: 'transfer',
    title: 'Transfer',
    path: '/transfer',
    icon: getIcon('actions', 'upload')!,
    devOnly: true,
  },
];

const EXPERIMENTAL_TOOLS: ToolItem[] = [
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

function filterTools(tools: ToolItem[]): ToolItem[] {
  return tools.filter((tool) => !tool.devOnly || import.meta.env.DEV);
}

function ToolIconRow({ tools }: { tools: ToolItem[] }) {
  const navigate = useNavigate();
  return (
    <IconButtonRow>
      {tools.map((tool) => {
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

const ToolsSection = React.memo(() => {
  const tools = filterTools(MAIN_TOOLS);
  return <ToolIconRow tools={tools} />;
});

ToolsSection.displayName = 'ToolsSection';

export const ExperimentalToolsSection = React.memo(() => {
  const tools = filterTools(EXPERIMENTAL_TOOLS);
  return <ToolIconRow tools={tools} />;
});

ExperimentalToolsSection.displayName = 'ExperimentalToolsSection';

export default ToolsSection;
