'use client';

import { isModelEnabledByDefault } from '@gruenerator/shared/models';
import {
  Badge,
  cn,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { memo, useEffect, useMemo, useState } from 'react';

import { useModelPreferencesContext } from '../../context/ModelPreferencesContext';
import { AUTO_MODEL_ID, AUTO_MODEL_OPTION, type SelectedModel } from '../../lib/resolveAutoModel';
import { useScopedSelectedModel, useScopedSetSelectedModel } from '../../lib/useScopedAgentState';
import { composerToolbarButtonClass } from '../../lib/utils';
import { MODEL_OPTIONS } from '../../stores/chatStore';

import { useChatDensity } from './chatDensityContext';

// Shared definition (see resolveAutoModel) — aliased to keep call sites terse.
const AUTO_OPTION = AUTO_MODEL_OPTION;

export const ModelPicker = memo(function ModelPicker() {
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedModel = useScopedSelectedModel();
  const setSelectedModel = useScopedSetSelectedModel();
  const { enabledModelIds } = useModelPreferencesContext();
  const isCompact = useChatDensity() === 'compact';

  const visibleCatalogModels = useMemo(() => {
    if (enabledModelIds) {
      return MODEL_OPTIONS.filter((m) => enabledModelIds.has(m.id));
    }
    return MODEL_OPTIONS.filter((m) => isModelEnabledByDefault(m.id));
  }, [enabledModelIds]);

  const isAuto = selectedModel === AUTO_MODEL_ID;
  const fallback = visibleCatalogModels[0] ?? MODEL_OPTIONS[0];
  const current = isAuto
    ? AUTO_OPTION
    : (visibleCatalogModels.find((m) => m.id === selectedModel) ?? fallback);

  useEffect(() => {
    if (!visibleCatalogModels.length) return;
    if (isAuto) return;
    if (!visibleCatalogModels.some((m) => m.id === selectedModel)) {
      setSelectedModel(visibleCatalogModels[0].id);
    }
  }, [visibleCatalogModels, selectedModel, setSelectedModel, isAuto]);

  const handleSelect = (id: SelectedModel) => {
    setSelectedModel(id);
    setMenuOpen(false);
  };

  const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400';

  /**
   * The auto entry is the default and the one we want people on, so it is
   * marked "Empfohlen". It deliberately does NOT preview a concrete model:
   * the choice is made on the server once the classifier knows what the turn
   * is about, so any name shown here would be a guess made before the request.
   */
  const autoRow = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-medium leading-tight">{AUTO_OPTION.name}</span>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4 font-medium">
          {AUTO_OPTION.recommendedLabel}
        </Badge>
      </span>
      <span className="text-muted-foreground text-xs leading-tight">{AUTO_OPTION.description}</span>
    </>
  );

  const desktopContent = (
    <>
      <DropdownMenuItem
        key={AUTO_OPTION.id}
        onSelect={() => setSelectedModel(AUTO_OPTION.id)}
        className={cn('flex flex-col items-start gap-0.5 py-1.5', isAuto && activeClass)}
      >
        {autoRow}
      </DropdownMenuItem>
      {visibleCatalogModels.map((model) => (
        <DropdownMenuItem
          key={model.id}
          onSelect={() => setSelectedModel(model.id)}
          className={cn(
            'flex flex-col items-start gap-0.5 py-1.5',
            selectedModel === model.id && activeClass
          )}
        >
          <span className="text-sm font-medium leading-tight">{model.name}</span>
          {model.description && (
            <span className="text-muted-foreground line-clamp-1 text-xs leading-tight">
              {model.description}
            </span>
          )}
        </DropdownMenuItem>
      ))}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title="Modell">
      <ResponsiveMenuItem
        key={AUTO_OPTION.id}
        active={isAuto}
        onClick={() => handleSelect(AUTO_OPTION.id)}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{AUTO_OPTION.name}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4 font-medium">
            {AUTO_OPTION.recommendedLabel}
          </Badge>
        </span>
        <span className="text-muted-foreground block text-xs">{AUTO_OPTION.description}</span>
      </ResponsiveMenuItem>
      {visibleCatalogModels.map((model) => (
        <ResponsiveMenuItem
          key={model.id}
          active={selectedModel === model.id}
          onClick={() => handleSelect(model.id)}
        >
          <span className="block font-medium">{model.name}</span>
          {model.description && (
            <span className="text-muted-foreground block text-xs">{model.description}</span>
          )}
        </ResponsiveMenuItem>
      ))}
    </ResponsiveMenuSection>
  );

  const currentShortName = ('shortName' in current && current.shortName) || current.name;

  const triggerLabel = isAuto ? (
    <span>Auto</span>
  ) : (
    <span>
      <span className="max-sm:hidden">{current.name}</span>
      <span className="sm:hidden">{currentShortName}</span>
    </span>
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
          className={composerToolbarButtonClass(isCompact)}
          aria-label={isAuto ? 'Modell wählen – Automatisch (empfohlen)' : 'Modell wählen'}
        >
          {triggerLabel}
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});
