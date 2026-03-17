import React, { useMemo, useCallback } from 'react';
import { HiExternalLink, HiPhotograph } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { StatusBadge } from '../../../components/common/StatusBadge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useImageStudioStore from '../../../stores/imageStudioStore';
import {
  getCategoryConfig,
  getTypesForCategory,
  getTypeConfig,
  getAllKiTypes,
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  TYPE_CONFIG,
} from '../utils/typeConfig';

import TypeCard from './TypeCard';

import type { TypeConfig } from '../utils/typeConfig/types';

const ImageStudioTypeSelector: React.FC = () => {
  const navigate = useNavigate();
  const category = useImageStudioStore((state) => state.category);
  const setType = useImageStudioStore((state) => state.setType);

  const { user } = useOptimizedAuth();
  const isAustrianUser = user?.locale === 'de-AT';

  const categoryConfig = useMemo(() => getCategoryConfig(category || ''), [category]);
  const typesInCategory = useMemo(() => {
    if (!category) return [];
    return getTypesForCategory(category);
  }, [category]);

  const handleTypeSelect = useCallback(
    (selectedType: string) => {
      if (!category) return;
      setType(selectedType);
      const config = getTypeConfig(selectedType) as TypeConfig | null;
      const urlSegment = config?.urlSlug || selectedType;
      if (category === IMAGE_STUDIO_CATEGORIES.KI) {
        navigate(`/imagine/${urlSegment}`);
      } else {
        navigate(`/image-studio/${config?.category || category}/${urlSegment}`);
      }
    },
    [setType, navigate, category]
  );

  if (!category) return null;

  // KI category
  if (category === IMAGE_STUDIO_CATEGORIES.KI) {
    const allKiTypes = getAllKiTypes();
    const editTypes = allKiTypes.filter((t) => t.subcategory === KI_SUBCATEGORIES.EDIT);
    const pureCreateConfig = TYPE_CONFIG[IMAGE_STUDIO_TYPES.PURE_CREATE];
    const createVariants = pureCreateConfig?.variants || [];

    const handleVariantSelect = (selectedVariant: string) => {
      setType(IMAGE_STUDIO_TYPES.PURE_CREATE);
      const store = useImageStudioStore.getState();
      store.updateFormData({ variant: selectedVariant });
      navigate(`/imagine/pure-create`);
    };

    return (
      <div className="w-full flex justify-center p-8 max-[768px]:p-4">
        <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-sm flex-wrap">Imagine (KI)</h1>
          </div>
          {isAustrianUser && (
            <a
              href="https://bildgenerator.gruene.at/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-md px-lg py-md bg-background-alt border border-[var(--border-subtle)] rounded-lg mb-lg no-underline text-inherit transition-all hover:border-primary-600 hover:shadow-md max-[768px]:flex-col max-[768px]:text-center max-[768px]:gap-sm"
            >
              <HiExternalLink className="text-2xl text-primary-600 shrink-0" />
              <span className="font-semibold text-sm text-[var(--font-color-h)]">
                Zum Grünen Bildgenerator
              </span>
              <span className="text-xs text-foreground">
                Erstelle Sharepics im passenden Design
              </span>
            </a>
          )}
          <div className="flex gap-6 w-full max-[1024px]:flex-wrap max-[768px]:grid max-[768px]:grid-cols-2 max-[768px]:gap-4 max-[480px]:grid-cols-1">
            {editTypes.map((config) => (
              <TypeCard
                key={config.id}
                onClick={() => handleTypeSelect(config.id)}
                previewImage={config.previewImage}
                previewImageFallback={config.previewImageFallback}
                label={config.label}
                description={config.description}
                className="flex-1 aspect-[3/4] max-[1024px]:basis-[calc(33.333%-1rem)]"
                badge={config.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
              />
            ))}
            {createVariants.map(
              (variant: {
                value: string;
                label: string;
                description: string;
                imageUrl: string;
                fallbackImageUrl?: string;
              }) => (
                <TypeCard
                  key={variant.value}
                  onClick={() => handleVariantSelect(variant.value)}
                  previewImage={variant.imageUrl}
                  previewImageFallback={variant.fallbackImageUrl}
                  label={variant.label}
                  description={variant.description}
                  className="flex-1 aspect-[3/4] max-[1024px]:basis-[calc(33.333%-1rem)]"
                />
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // Templates category
  if (category === IMAGE_STUDIO_CATEGORIES.TEMPLATES) {
    return (
      <div className="w-full flex justify-center p-8 max-[768px]:p-4">
        <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-sm flex-wrap">
              Wie soll dein Sharepic aussehen?
              <StatusBadge type="early-access" variant="inline" />
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-8 mt-8 max-[1024px]:grid-cols-2 max-[1024px]:gap-6 max-[768px]:grid-cols-2 max-[768px]:gap-4 max-[480px]:grid-cols-1">
            {typesInCategory.map((config) => {
              const Icon = config.icon || HiPhotograph;
              return config.previewImage ? (
                <TypeCard
                  key={config.id}
                  onClick={() => handleTypeSelect(config.id)}
                  previewImage={config.previewImage}
                  previewImageFallback={config.previewImageFallback}
                  label={config.label}
                  className="aspect-[3/4]"
                  badge={config.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
                />
              ) : (
                <TypeCard
                  key={config.id}
                  onClick={() => handleTypeSelect(config.id)}
                  label={config.label}
                  description={config.description}
                  badge={config.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
                >
                  <div className="text-5xl mb-4">
                    <Icon />
                  </div>
                  <h3 className="text-xl mb-4 text-[var(--font-color-h3)] text-center">
                    {config.label}
                  </h3>
                  <p className="text-base leading-normal mb-6 text-foreground">
                    {config.description}
                  </p>
                </TypeCard>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="w-full flex justify-center p-8 max-[768px]:p-4">
      <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
        <div className="text-center">
          <h1 className="flex items-center justify-center gap-sm flex-wrap">
            {categoryConfig?.label}
          </h1>
          <p className="text-lg mb-12 text-foreground">{categoryConfig?.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-8 mt-8 max-[768px]:grid-cols-1">
          {typesInCategory.map((config) => {
            const Icon = config.icon || HiPhotograph;
            return config.previewImage ? (
              <TypeCard
                key={config.id}
                onClick={() => handleTypeSelect(config.id)}
                previewImage={config.previewImage}
                previewImageFallback={config.previewImageFallback}
                label={config.label}
                badge={config.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
              />
            ) : (
              <TypeCard
                key={config.id}
                onClick={() => handleTypeSelect(config.id)}
                label={config.label}
                description={config.description}
                badge={config.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
              >
                <div className="text-5xl mb-4">
                  <Icon />
                </div>
                <h3 className="text-xl mb-4 text-[var(--font-color-h3)] text-center">
                  {config.label}
                </h3>
                <p className="text-base leading-normal mb-6 text-foreground">
                  {config.description}
                </p>
              </TypeCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImageStudioTypeSelector;
