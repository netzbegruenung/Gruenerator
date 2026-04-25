'use client';

import { memo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import {
  cn,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { useShallow } from 'zustand/shallow';

import { MODEL_ICONS } from '../../lib/modelIcons';
import { composerToolbarButtonClass } from '../../lib/utils';
import { MODEL_OPTIONS, useAgentStore, type ModelId } from '../../stores/chatStore';

export const ModelPicker = memo(function ModelPicker() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedModel, setSelectedModel } = useAgentStore(
    useShallow((s) => ({
      selectedModel: s.selectedModel,
      setSelectedModel: s.setSelectedModel,
    }))
  );

  const current = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0];
  const CurrentIcon = MODEL_ICONS[current.icon];

  const handleSelect = (id: string) => {
    setSelectedModel(id as ModelId);
    setMenuOpen(false);
  };

  const desktopContent = (
    <>
      {MODEL_OPTIONS.map((model) => {
        const Icon = MODEL_ICONS[model.icon];
        const isActive = selectedModel === model.id;
        return (
          <DropdownMenuItem
            key={model.id}
            onSelect={() => setSelectedModel(model.id)}
            className={cn(
              'flex-col items-stretch gap-1 py-2',
              isActive &&
                'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium leading-tight">{model.name}</span>
            </div>
            <span
              className={cn(
                'text-[11px] leading-snug',
                isActive ? 'text-primary-700/80 dark:text-primary-400/80' : 'text-foreground-muted'
              )}
            >
              {model.description}
            </span>
            {model.warning && (
              <span className="text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                {model.warning}
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title="Modell">
      {MODEL_OPTIONS.map((model) => {
        const Icon = MODEL_ICONS[model.icon];
        return (
          <ResponsiveMenuItem
            key={model.id}
            active={selectedModel === model.id}
            onClick={() => handleSelect(model.id)}
          >
            <div className="flex w-full flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium">{model.name}</span>
              </div>
              <span className="text-[11px] leading-snug text-foreground-muted">
                {model.description}
              </span>
              {model.warning && (
                <span className="text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                  {model.warning}
                </span>
              )}
            </div>
          </ResponsiveMenuItem>
        );
      })}
    </ResponsiveMenuSection>
  );

  return (
    <ResponsiveMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      sheetTitle="Modell wählen"
      dropdownAlign="end"
      dropdownClassName="min-w-[22rem] max-w-[90vw]"
      trigger={
        <button
          type="button"
          className={composerToolbarButtonClass}
          aria-label={
            current.warning ? `Modell wählen – ${current.name} (Warnhinweis)` : 'Modell wählen'
          }
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{current.name}</span>
          {current.warning && (
            <AlertTriangle
              className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500"
              aria-hidden="true"
            />
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});
