'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import {
  cn,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { isModelEnabledByDefault, TEXT_MODEL_BY_ID } from '@gruenerator/shared/models';
import { getSystemAgent } from '@gruenerator/shared/agents';

import { composerToolbarButtonClass } from '../../lib/utils';
import { useChatDensity } from './chatDensityContext';
import { MODEL_OPTIONS, type ThreadMode } from '../../stores/chatStore';
import {
  useScopedAgentId,
  useScopedSelectedModel,
  useScopedSetSelectedModel,
  useScopedThreadMode,
} from '../../lib/useScopedAgentState';
import { useModelPreferencesContext } from '../../context/ModelPreferencesContext';
import {
  AUTO_MODEL_ID,
  AUTO_MODEL_OPTION,
  resolveAutoModel,
  type SelectedModel,
} from '../../lib/resolveAutoModel';

// Shared definition (see resolveAutoModel) — aliased to keep call sites terse.
const AUTO_OPTION = AUTO_MODEL_OPTION;

interface ModelPickerProps {
  /** When the picker is mounted on a non-/chat surface that lacks a
   * ChatSurfaceProvider (e.g. NotebookChatProvider), pass the implicit
   * thread mode here so `resolveAutoModel` picks the right default. */
  threadModeOverride?: ThreadMode;
}

export const ModelPicker = memo(function ModelPicker({
  threadModeOverride,
}: ModelPickerProps = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedModel = useScopedSelectedModel();
  const setSelectedModel = useScopedSetSelectedModel();
  const selectedAgentId = useScopedAgentId();
  const scopedThreadMode = useScopedThreadMode();
  const threadMode = threadModeOverride ?? scopedThreadMode;
  const { enabledModelIds } = useModelPreferencesContext();
  const isCompact = useChatDensity() === 'compact';

  const visibleCatalogModels = useMemo(() => {
    if (enabledModelIds) {
      return MODEL_OPTIONS.filter((m) => enabledModelIds.has(m.id));
    }
    return MODEL_OPTIONS.filter((m) => isModelEnabledByDefault(m.id));
  }, [enabledModelIds]);

  const resolvedAuto = useMemo(() => {
    const agent = selectedAgentId ? (getSystemAgent(selectedAgentId) ?? null) : null;
    return TEXT_MODEL_BY_ID[resolveAutoModel({ threadMode, agent })];
  }, [selectedAgentId, threadMode]);

  const fallback = visibleCatalogModels[0] ?? MODEL_OPTIONS[0];
  const current =
    selectedModel === AUTO_MODEL_ID
      ? AUTO_OPTION
      : (visibleCatalogModels.find((m) => m.id === selectedModel) ?? fallback);

  useEffect(() => {
    if (!visibleCatalogModels.length) return;
    if (selectedModel === AUTO_MODEL_ID) return;
    if (!visibleCatalogModels.some((m) => m.id === selectedModel)) {
      setSelectedModel(visibleCatalogModels[0].id);
    }
  }, [visibleCatalogModels, selectedModel, setSelectedModel]);

  const handleSelect = (id: SelectedModel) => {
    setSelectedModel(id);
    setMenuOpen(false);
  };

  const desktopContent = (
    <>
      <DropdownMenuItem
        key={AUTO_OPTION.id}
        onSelect={() => setSelectedModel(AUTO_OPTION.id)}
        className={cn(
          'flex flex-col items-start gap-0.5 py-1.5',
          selectedModel === AUTO_OPTION.id &&
            'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
        )}
      >
        <span className="text-sm font-medium leading-tight">{AUTO_OPTION.name}</span>
        <span className="text-muted-foreground text-xs leading-tight">
          {AUTO_OPTION.description}
        </span>
        <span className="text-muted-foreground text-xs leading-tight">→ {resolvedAuto.name}</span>
      </DropdownMenuItem>
      {visibleCatalogModels.map((model) => {
        const isActive = selectedModel === model.id;
        return (
          <DropdownMenuItem
            key={model.id}
            onSelect={() => setSelectedModel(model.id)}
            className={cn(
              'flex flex-col items-start gap-0.5 py-1.5',
              isActive &&
                'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
            )}
          >
            <span className="text-sm font-medium leading-tight">{model.name}</span>
            {model.description && (
              <span className="text-muted-foreground line-clamp-1 text-xs leading-tight">
                {model.description}
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title="Modell">
      <ResponsiveMenuItem
        key={AUTO_OPTION.id}
        active={selectedModel === AUTO_OPTION.id}
        onClick={() => handleSelect(AUTO_OPTION.id)}
      >
        <span className="block font-medium">{AUTO_OPTION.name}</span>
        <span className="text-muted-foreground block text-xs">{AUTO_OPTION.description}</span>
        <span className="text-muted-foreground block text-xs">→ {resolvedAuto.name}</span>
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

  // The resolved model is only shown inside the opened menu — the trigger
  // stays a terse "Auto" so it doesn't squeeze the composer input.
  const triggerLabel =
    selectedModel === AUTO_MODEL_ID ? (
      <span>Auto</span>
    ) : (
      <span>
        <span className="max-sm:hidden">{current.name}</span>
        <span className="sm:hidden">{currentShortName}</span>
      </span>
    );

  const ariaLabel =
    selectedModel === AUTO_MODEL_ID
      ? `Modell wählen – Automatisch (${resolvedAuto.name})`
      : 'Modell wählen';

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
          aria-label={ariaLabel}
        >
          {triggerLabel}
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});
