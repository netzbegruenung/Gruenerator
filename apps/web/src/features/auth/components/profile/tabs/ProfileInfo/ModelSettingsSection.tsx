import {
  MODEL_OPTIONS,
  REGION_LABELS,
  REGION_ORDER,
  type ModelId,
  type ModelOption,
  type ModelRegion,
} from '@gruenerator/shared/models';
import { Switch } from '@gruenerator/ui';
import { Info, AlertTriangle } from 'lucide-react';
import React from 'react';

import { useModelPreferences } from '../../../../../models/hooks/useModelPreferences';

interface ModelSettingsSectionProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

function groupByRegion(models: ModelOption[]): Map<ModelRegion, ModelOption[]> {
  const grouped = new Map<ModelRegion, ModelOption[]>();
  for (const model of models) {
    const list = grouped.get(model.region) ?? [];
    list.push(model);
    grouped.set(model.region, list);
  }
  return grouped;
}

const ModelSettingsSection = React.memo(
  ({ onSuccessMessage, onErrorMessage }: ModelSettingsSectionProps) => {
    const { preferences, isLoading, toggleModel } = useModelPreferences();
    const grouped = groupByRegion(MODEL_OPTIONS);

    const handleToggle = async (modelId: ModelId, label: string, enabled: boolean) => {
      try {
        await toggleModel(modelId, enabled);
        onSuccessMessage(`${label} ${enabled ? 'aktiviert' : 'deaktiviert'}.`);
      } catch {
        onErrorMessage('Modell-Einstellung konnte nicht gespeichert werden.');
      }
    };

    if (isLoading) {
      return (
        <div className="animate-pulse">
          <div className="h-32 rounded-lg bg-grey-100 dark:bg-grey-800" />
        </div>
      );
    }

    return (
      <div className="space-y-md">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-xs">KI-Modelle</h3>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            Wähle, welche Modelle in der Modellauswahl im Chat erscheinen.
          </p>
        </div>

        <div className="flex items-start gap-sm p-md rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800">
          <Info className="w-4 h-4 mt-0.5 text-primary-600 dark:text-primary-400 shrink-0" />
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Deaktivierte Modelle werden nicht in der Modellauswahl im Chat angezeigt. Chinesische
            Modelle sind standardmäßig deaktiviert.
          </p>
        </div>

        {REGION_ORDER.map((region) => {
          const models = grouped.get(region);
          if (!models?.length) return null;

          return (
            <div
              key={region}
              className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden"
            >
              <div className="px-md py-sm bg-grey-50 dark:bg-grey-800/50 border-b border-grey-200 dark:border-grey-700">
                <h4 className="text-sm font-semibold text-foreground">{REGION_LABELS[region]}</h4>
                {region === 'self-hosted' && (
                  <p className="text-xs text-grey-500 dark:text-grey-400 mt-xs">
                    Diese Modelle laufen in europäischen Rechenzentren mit 100% erneuerbarer Energie
                    und ohne Wasserkühlung. Jede Anfrage ist damit CO₂-neutral und schont knappe
                    Wasserressourcen.
                  </p>
                )}
                {region === 'eu' && (
                  <p className="text-xs text-grey-500 dark:text-grey-400 mt-xs">
                    Mistral AI ist Europas einziger ernstzunehmender Anbieter auf Augenhöhe mit den
                    großen US-Laboren. Das französische Unternehmen entwickelt leistungsfähige,
                    teils offen verfügbare Modelle nach europäischen Datenschutz- und
                    Souveränitätsstandards.
                  </p>
                )}
              </div>

              <div className="divide-y divide-grey-100 dark:divide-grey-800">
                {models.map((model) => {
                  const enabled = preferences[model.id]?.enabled ?? !model.offByDefault;

                  return (
                    <div
                      key={model.id}
                      className="flex items-start gap-md px-md py-sm hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors"
                    >
                      <div className="grow min-w-0">
                        <p className="text-sm font-medium text-foreground">{model.name}</p>
                        <p className="text-xs text-grey-500 dark:text-grey-400">
                          {model.description}
                        </p>
                        {model.warning && (
                          <p className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-xs mt-xs">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{model.warning}</span>
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <Switch
                          className="h-[20px] w-[40px] data-[state=checked]:bg-secondary-600 data-[state=unchecked]:bg-grey-200 dark:data-[state=unchecked]:bg-grey-700"
                          checked={enabled}
                          onCheckedChange={(checked: boolean) =>
                            handleToggle(model.id, model.name, checked)
                          }
                          aria-label={`${model.name} aktivieren`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

ModelSettingsSection.displayName = 'ModelSettingsSection';

export default ModelSettingsSection;
