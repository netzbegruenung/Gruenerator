import {
  FLUX_VARIANT_ORDER,
  IMAGE_FAMILIES,
  IMAGE_MODEL_BY_ID,
  REGION_LABELS,
  REGION_ORDER,
  getDefaultModelForFamily,
  getImageFamily,
  type ImageFamilyId,
  type ImageFamilyOption,
  type ImageModelId,
  type ModelRegion,
} from '@gruenerator/shared/models';
import { Info } from 'lucide-react';
import React from 'react';

import { useImageModelPreference } from '../../../../../models/hooks/useImageModelPreference';

interface ImageModelSettingsSectionProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

function groupByRegion(families: ImageFamilyOption[]): Map<ModelRegion, ImageFamilyOption[]> {
  const grouped = new Map<ModelRegion, ImageFamilyOption[]>();
  for (const family of families) {
    const list = grouped.get(family.region) ?? [];
    list.push(family);
    grouped.set(family.region, list);
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
    const grouped = groupByRegion(IMAGE_FAMILIES);

    const selectedFamily = getImageFamily(defaultImageModel);

    const handleSelectFamily = async (familyId: ImageFamilyId, label: string) => {
      try {
        const nextModel = getDefaultModelForFamily(familyId);
        await setDefaultImageModel(nextModel);
        onSuccessMessage(`Standard-Bildmodell auf ${label} gesetzt.`);
      } catch {
        onErrorMessage('Bildmodell-Einstellung konnte nicht gespeichert werden.');
      }
    };

    const handleSelectFluxVariant = async (variantId: ImageModelId) => {
      try {
        await setDefaultImageModel(variantId);
        onSuccessMessage(`Flux-Variante auf ${IMAGE_MODEL_BY_ID[variantId].name} gesetzt.`);
      } catch {
        onErrorMessage('Flux-Variante konnte nicht gespeichert werden.');
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
          const families = grouped.get(region);
          if (!families?.length) return null;

          return (
            <div
              key={region}
              className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden"
            >
              <div className="px-md py-sm bg-grey-50 dark:bg-grey-800/50 border-b border-grey-200 dark:border-grey-700">
                <h4 className="text-sm font-semibold text-foreground">{REGION_LABELS[region]}</h4>
              </div>

              <div className="divide-y divide-grey-100 dark:divide-grey-800">
                {families.map((family) => {
                  const isSelected = selectedFamily === family.id;

                  return (
                    <div key={family.id}>
                      <label
                        className={`flex items-start gap-md px-md py-sm cursor-pointer hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors ${
                          isSelected ? 'bg-secondary-50 dark:bg-secondary-950/20' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="default-image-family"
                          value={family.id}
                          checked={isSelected}
                          onChange={() => handleSelectFamily(family.id, family.name)}
                          className="mt-1 shrink-0 accent-secondary-600"
                          aria-label={`${family.name} als Standard wählen`}
                        />
                        <div className="grow min-w-0">
                          <p className="text-sm font-medium text-foreground">{family.name}</p>
                          <p className="text-xs text-grey-500 dark:text-grey-400">
                            {family.description}
                          </p>
                        </div>
                      </label>

                      {isSelected && family.id === 'flux' && (
                        <div className="px-md pb-sm pl-xl">
                          <p className="text-xs text-grey-500 dark:text-grey-400 mb-xs">
                            Flux-Variante:
                          </p>
                          <div className="flex flex-wrap gap-xs">
                            {FLUX_VARIANT_ORDER.map((variantId) => {
                              const variant = IMAGE_MODEL_BY_ID[variantId];
                              const isVariantSelected = defaultImageModel === variantId;
                              return (
                                <button
                                  key={variantId}
                                  type="button"
                                  onClick={() => handleSelectFluxVariant(variantId)}
                                  className={`rounded-md border px-sm py-xs text-xs transition-colors ${
                                    isVariantSelected
                                      ? 'border-secondary-600 bg-secondary-50 text-secondary-700 dark:bg-secondary-950/30 dark:text-secondary-300'
                                      : 'border-grey-200 dark:border-grey-700 text-grey-600 dark:text-grey-300 hover:border-grey-300 dark:hover:border-grey-600'
                                  }`}
                                  title={formatCost(variant.costMultiplier)}
                                >
                                  {variant.name.replace(/^Flux /, '')} ·{' '}
                                  {formatCost(variant.costMultiplier)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
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

ImageModelSettingsSection.displayName = 'ImageModelSettingsSection';

export default ImageModelSettingsSection;
