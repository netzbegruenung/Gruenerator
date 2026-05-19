import {
  IMAGE_MODELS,
  REGION_LABELS,
  REGION_ORDER,
  type ImageModelId,
  type ImageModelOption,
  type ModelRegion,
} from '@gruenerator/shared/models';
import { Info } from 'lucide-react';
import React from 'react';

import { useImageModelPreference } from '../../../../../models/hooks/useImageModelPreference';

interface ImageModelSettingsSectionProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

function groupByRegion(models: ImageModelOption[]): Map<ModelRegion, ImageModelOption[]> {
  const grouped = new Map<ModelRegion, ImageModelOption[]>();
  for (const model of models) {
    const list = grouped.get(model.region) ?? [];
    list.push(model);
    grouped.set(model.region, list);
  }
  return grouped;
}

function formatCost(multiplier: number): string {
  if (multiplier === 1) return '1 Bild pro Generation';
  if (multiplier === 0.5) return '½ Bild pro Generation';
  return `${multiplier} Bilder pro Generation`;
}

const ImageModelSettingsSection = React.memo(
  ({ onSuccessMessage, onErrorMessage }: ImageModelSettingsSectionProps) => {
    const { defaultImageModel, isLoading, setDefaultImageModel } = useImageModelPreference();
    const grouped = groupByRegion(IMAGE_MODELS);

    const handleSelect = async (modelId: ImageModelId, label: string) => {
      try {
        await setDefaultImageModel(modelId);
        onSuccessMessage(`Standard-Bildmodell auf ${label} gesetzt.`);
      } catch {
        onErrorMessage('Bildmodell-Einstellung konnte nicht gespeichert werden.');
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
          <h3 className="text-sm font-medium text-foreground mb-xs">Bildmodelle</h3>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            Wähle dein Standard-Bildmodell. Im Bild-Generator kannst du es für einzelne Generationen
            überschreiben.
          </p>
        </div>

        <div className="flex items-start gap-sm p-md rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800">
          <Info className="w-4 h-4 mt-0.5 text-primary-600 dark:text-primary-400 shrink-0" />
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Modelle verbrauchen unterschiedlich viele Bilder vom Tageskontingent (10 Bilder/Tag).
            Klein verbraucht nur ½ Bild, Max verbraucht 2 Bilder.
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
              </div>

              <div className="divide-y divide-grey-100 dark:divide-grey-800">
                {models.map((model) => {
                  const isSelected = defaultImageModel === model.id;

                  return (
                    <label
                      key={model.id}
                      className={`flex items-start gap-md px-md py-sm cursor-pointer hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors ${
                        isSelected ? 'bg-secondary-50 dark:bg-secondary-950/20' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="default-image-model"
                        value={model.id}
                        checked={isSelected}
                        onChange={() => handleSelect(model.id, model.name)}
                        className="mt-1 shrink-0 accent-secondary-600"
                        aria-label={`${model.name} als Standard wählen`}
                      />
                      <div className="grow min-w-0">
                        <p className="text-sm font-medium text-foreground">{model.name}</p>
                        <p className="text-xs text-grey-500 dark:text-grey-400">
                          {model.description}
                        </p>
                        <p className="text-xs text-grey-400 dark:text-grey-500 mt-xs">
                          {formatCost(model.costMultiplier)}
                        </p>
                      </div>
                    </label>
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

ImageModelSettingsSection.displayName = 'ImageModelSettingsSection';

export default ImageModelSettingsSection;
