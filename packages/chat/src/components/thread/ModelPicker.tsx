'use client';

import { isModelEnabledByDefault } from '@gruenerator/shared/models';
import { memo, useEffect, useMemo } from 'react';

import { useModelPreferencesContext } from '../../context/ModelPreferencesContext';
import { AUTO_MODEL_ID, AUTO_MODEL_OPTION, type SelectedModel } from '../../lib/resolveAutoModel';
import { useScopedSelectedModel, useScopedSetSelectedModel } from '../../lib/useScopedAgentState';
import { MODEL_OPTIONS } from '../../stores/chatStore';

import { type ComposerOption, ComposerOptionPicker } from './ComposerOptionPicker';

// Shared definition (see resolveAutoModel) — aliased to keep call sites terse.
const AUTO_OPTION = AUTO_MODEL_OPTION;

export const ModelPicker = memo(function ModelPicker() {
  const selectedModel = useScopedSelectedModel();
  const setSelectedModel = useScopedSetSelectedModel();
  const { enabledModelIds } = useModelPreferencesContext();

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

  const options = useMemo<ComposerOption<SelectedModel>[]>(
    () => [
      /**
       * The auto entry is the default and the one we want people on, so it is
       * marked "Empfohlen". It deliberately does NOT preview a concrete model:
       * the choice is made on the server once the classifier knows what the turn
       * is about, so any name shown here would be a guess made before the request.
       */
      {
        id: AUTO_OPTION.id,
        name: AUTO_OPTION.name,
        description: AUTO_OPTION.description,
        recommendedLabel: AUTO_OPTION.recommendedLabel,
      },
      ...visibleCatalogModels.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
      })),
    ],
    [visibleCatalogModels]
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
    <ComposerOptionPicker
      options={options}
      value={selectedModel}
      onChange={setSelectedModel}
      sheetTitle="Modell wählen"
      sectionTitle="Modell"
      ariaLabel={isAuto ? 'Modell wählen – Automatisch (empfohlen)' : 'Modell wählen'}
      triggerLabel={triggerLabel}
    />
  );
});
