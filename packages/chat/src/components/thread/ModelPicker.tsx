'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import {
  cn,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { useShallow } from 'zustand/shallow';
import { isModelEnabledByDefault } from '@gruenerator/shared/models';

import { composerToolbarButtonClass } from '../../lib/utils';
import { MODEL_OPTIONS, useAgentStore, type ModelId } from '../../stores/chatStore';
import { useModelPreferencesContext } from '../../context/ModelPreferencesContext';

export const ModelPicker = memo(function ModelPicker() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedModel, setSelectedModel } = useAgentStore(
    useShallow((s) => ({
      selectedModel: s.selectedModel,
      setSelectedModel: s.setSelectedModel,
    }))
  );
  const { enabledModelIds } = useModelPreferencesContext();

  const visibleModels = useMemo(() => {
    if (enabledModelIds) {
      return MODEL_OPTIONS.filter((m) => enabledModelIds.has(m.id));
    }
    return MODEL_OPTIONS.filter((m) => isModelEnabledByDefault(m.id));
  }, [enabledModelIds]);

  const fallback = visibleModels[0] ?? MODEL_OPTIONS[0];
  const current = visibleModels.find((m) => m.id === selectedModel) ?? fallback;

  useEffect(() => {
    if (!visibleModels.length) return;
    if (!visibleModels.some((m) => m.id === selectedModel)) {
      setSelectedModel(visibleModels[0].id);
    }
  }, [visibleModels, selectedModel, setSelectedModel]);

  const handleSelect = (id: string) => {
    setSelectedModel(id as ModelId);
    setMenuOpen(false);
  };

  const desktopContent = (
    <>
      {visibleModels.map((model) => {
        const isActive = selectedModel === model.id;
        return (
          <DropdownMenuItem
            key={model.id}
            onSelect={() => setSelectedModel(model.id)}
            className={cn(
              'flex items-center gap-2 py-1.5',
              isActive &&
                'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
            )}
          >
            <span className="text-sm font-medium leading-tight">{model.name}</span>
            {model.warning && (
              <AlertTriangle
                className="h-3 w-3 text-amber-600 dark:text-amber-500"
                aria-label={model.warning}
              />
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title="Modell">
      {visibleModels.map((model) => (
        <ResponsiveMenuItem
          key={model.id}
          active={selectedModel === model.id}
          onClick={() => handleSelect(model.id)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{model.name}</span>
            {model.warning && (
              <AlertTriangle
                className="h-3 w-3 text-amber-600 dark:text-amber-500"
                aria-label={model.warning}
              />
            )}
          </div>
        </ResponsiveMenuItem>
      ))}
    </ResponsiveMenuSection>
  );

  return (
    <ResponsiveMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      sheetTitle="Modell wählen"
      dropdownAlign="end"
      dropdownClassName="min-w-[12rem] max-w-[90vw]"
      trigger={
        <button
          type="button"
          className={composerToolbarButtonClass}
          aria-label={
            current.warning ? `Modell wählen – ${current.name} (Warnhinweis)` : 'Modell wählen'
          }
        >
          <span>{current.name}</span>
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
