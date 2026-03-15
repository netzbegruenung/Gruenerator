import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useCallback } from 'react';
import { FiColumns, FiGrid, FiList, FiCalendar, FiBarChart2, FiPlus } from 'react-icons/fi';

import type { BoardView, ViewLayout } from '../types';

import { cn } from '@/utils/cn';

const VIEW_ICONS: Record<ViewLayout, typeof FiColumns> = {
  kanban: FiColumns,
  table: FiGrid,
  list: FiList,
  calendar: FiCalendar,
  gantt: FiBarChart2,
};

const VIEW_LABELS: Record<ViewLayout, string> = {
  kanban: 'Kanban',
  table: 'Tabelle',
  list: 'Liste',
  calendar: 'Kalender',
  gantt: 'Gantt',
};

interface ViewSwitcherProps {
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onAddView: (layout: ViewLayout) => void;
}

export const ViewSwitcher = memo(function ViewSwitcher({
  views,
  activeViewId,
  onViewChange,
  onAddView,
}: ViewSwitcherProps) {
  const existingLayouts = new Set(views.map((v) => v.layout));

  const handleAdd = useCallback((layout: ViewLayout) => onAddView(layout), [onAddView]);

  return (
    <div className="flex items-center gap-1 px-md sm:px-lg pt-xs">
      {views.map((view) => {
        const Icon = VIEW_ICONS[view.layout] ?? FiGrid;
        const isActive = view.id === activeViewId;
        return (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all border-none cursor-pointer',
              isActive
                ? 'bg-background-pure text-foreground shadow-sm dark:bg-[#282828]'
                : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
          >
            <Icon size={13} />
            {view.name}
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 border-none cursor-pointer transition-colors"
            title="Ansicht hinzufügen"
          >
            <FiPlus size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(VIEW_LABELS) as ViewLayout[]).map((layout) => {
            const Icon = VIEW_ICONS[layout];
            const exists = existingLayouts.has(layout);
            return (
              <DropdownMenuItem
                key={layout}
                onClick={() => handleAdd(layout)}
                disabled={exists}
                className={exists ? 'opacity-50' : ''}
              >
                <Icon className="mr-2" size={14} />
                {VIEW_LABELS[layout]}
                {exists && <span className="ml-auto text-[10px] text-grey-400">vorhanden</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
