import { DocsProvider } from '@gruenerator/docs';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { getIcon } from '../../config/icons';
import { getToolTheme } from '../../config/toolTheme';
import { OFFICE_SUITE_TOOLS, filterWorkplaceTools } from '../../config/workplaceToolsConfig';

import { webAppDocsAdapter } from './docsAdapter';
import { useOfficeCreate } from './useOfficeCreate';

import type { IconType } from '../../config/icons';

interface Entry {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  onSelect: () => void;
}

function NewContentMenuInner() {
  const navigate = useNavigate();
  const { createBlankDocument, createBlankBoard, createBlankSheet, createBlankPresentation } =
    useOfficeCreate();

  const entries = useMemo<Entry[]>(() => {
    const office = filterWorkplaceTools(OFFICE_SUITE_TOOLS).map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      icon: tool.icon,
      onSelect: () => {
        if (tool.create === 'gallery') void navigate('/office');
        else if (tool.create === 'board') createBlankBoard();
        else if (tool.create === 'sheet') void createBlankSheet();
        else if (tool.create === 'pres') void createBlankPresentation();
        else void createBlankDocument();
      },
    }));
    return [
      ...office,
      {
        id: 'wissen',
        title: 'Notebook',
        description: 'Eigene Quellen sammeln & befragen',
        icon: getIcon('navigation', 'notebooks')!,
        onSelect: () => void navigate('/notebooks/neu'),
      },
    ];
  }, [navigate, createBlankDocument, createBlankBoard, createBlankSheet, createBlankPresentation]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 rounded-full">
          Neu erstellen
          <FiChevronDown aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[260px] rounded-xl p-1.5">
        {entries.map((entry) => {
          const theme = getToolTheme(entry.id);
          const Icon = entry.icon;
          return (
            <DropdownMenuItem
              key={entry.id}
              onSelect={entry.onSelect}
              className="gap-3 rounded-lg px-2.5 py-2"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
              >
                <Icon className={`size-5 ${theme?.icon ?? ''}`} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground-heading">{entry.title}</span>
                <span className="text-xs text-muted-foreground">{entry.description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** „Neu erstellen" beside „Zuletzt": the empty Office resources plus a new Notebook. */
export function NewContentMenu() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <NewContentMenuInner />
    </DocsProvider>
  );
}
