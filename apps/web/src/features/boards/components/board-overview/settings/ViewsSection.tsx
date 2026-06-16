import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

import { VIEW_ICONS, VIEW_LABELS } from '../../ViewSwitcher';

import type { BoardView, ViewLayout } from '../../../types';

const ALL_LAYOUTS = Object.keys(VIEW_LABELS) as ViewLayout[];

interface ViewsSectionProps {
  views: BoardView[];
  onAddView: (layout: ViewLayout) => void;
  onRemoveView: (viewId: string) => void;
}

/** Manage board views (Kanban/Tabelle/Liste/Kalender/Gantt) outside expert mode. */
export const ViewsSection = memo(function ViewsSection({
  views,
  onAddView,
  onRemoveView,
}: ViewsSectionProps) {
  const existingLayouts = new Set(views.map((v) => v.layout));
  const canDelete = views.length > 1;

  return (
    <section className="flex max-w-2xl flex-col gap-md">
      <div>
        <h2 className="text-base font-semibold text-foreground">Ansichten</h2>
        <p className="mt-0.5 text-sm text-grey-500">
          Verschiedene Darstellungen derselben Karten. Jedes Layout kann nur einmal vorkommen.
        </p>
      </div>

      <div className="space-y-2">
        {views.map((view) => {
          const Icon = VIEW_ICONS[view.layout];
          return (
            <div
              key={view.id}
              className="flex items-center gap-2.5 rounded-md border border-grey-200 px-3 py-2.5 dark:border-grey-700"
            >
              <Icon size={15} className="text-grey-500" />
              <span className="flex-1 text-sm text-foreground">{view.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-grey-400">
                {VIEW_LABELS[view.layout]}
              </span>
              {canDelete && (
                <button
                  onClick={() => onRemoveView(view.id)}
                  aria-label={`Ansicht „${view.name}" entfernen`}
                  className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
                >
                  <FiTrash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-grey-200 pt-md dark:border-grey-700">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <FiPlus size={14} className="mr-1.5" /> Ansicht hinzufügen
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ALL_LAYOUTS.map((layout) => {
              const Icon = VIEW_ICONS[layout];
              const exists = existingLayouts.has(layout);
              return (
                <DropdownMenuItem
                  key={layout}
                  onClick={() => onAddView(layout)}
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
    </section>
  );
});
