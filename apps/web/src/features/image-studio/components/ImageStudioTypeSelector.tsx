import React, { useMemo, useCallback } from 'react';
import { HiPhotograph } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { StatusBadge } from '../../../components/common/StatusBadge';
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
  FORM_STEPS,
} from '../utils/typeConfig';
import { type TypeConfig } from '../utils/typeConfig/types';

import '../image-studio-shared.css';
import './ImageStudioTypeSelector.css';

const ImageStudioTypeSelector: React.FC = () => {
  const navigate = useNavigate();
  const category = useImageStudioStore((state) => state.category);
  const setType = useImageStudioStore((state) => state.setType);

  const categoryConfig = useMemo(() => getCategoryConfig(category || ''), [category]);
  const typesInCategory = useMemo(() => {
    if (!category) return [];
    return getTypesForCategory(category);
  }, [category]);

  // Hook must be called before early return (Rules of Hooks)
  const handleTypeSelect = useCallback(
    (selectedType: string) => {
      if (!category) return;
      setType(selectedType);
      const config = getTypeConfig(selectedType) as TypeConfig | null;
      const urlSegment = config?.urlSlug || selectedType;
      navigate(`/image-studio/${config?.category || category}/${urlSegment}`);
    },
    [setType, navigate, category]
  );

  // Wait for category to be set
  if (!category) return null;

  // KI category - show all variants and edit types in one grid
  if (category === IMAGE_STUDIO_CATEGORIES.KI) {
    const allKiTypes = getAllKiTypes();
    const editTypes = allKiTypes.filter((t) => t.subcategory === KI_SUBCATEGORIES.EDIT);

    // Get variants for pure-create (the style options)
    const pureCreateConfig = TYPE_CONFIG[IMAGE_STUDIO_TYPES.PURE_CREATE];
    const createVariants = pureCreateConfig?.variants || [];

    const handleVariantSelect = (selectedVariant: string) => {
      setType(IMAGE_STUDIO_TYPES.PURE_CREATE);
      const store = useImageStudioStore.getState();
      store.updateFormData({ variant: selectedVariant });
      navigate(`/image-studio/ki/pure-create`);
    };

    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <div className="type-selector-header-wrapper">
            <h1>Imagine (KI)</h1>
          </div>
          <div className="type-options-grid type-options-grid--five">
            {editTypes.map((config) => (
              <div
                key={config.id}
                className={`type-card type-card--image no-overlay ${config.isBeta ? 'beta' : ''}`}
                onClick={() => handleTypeSelect(config.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) =>
                  e.key === 'Enter' && handleTypeSelect(config.id)
                }
              >
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <img src={config.previewImage} alt={config.label} className="type-card__image" />
                <h3>{config.label}</h3>
                <p className="type-card__description">{config.description}</p>
              </div>
            ))}
            {createVariants.map(
              (variant: {
                value: string;
                label: string;
                description: string;
                imageUrl: string;
              }) => (
                <div
                  key={variant.value}
                  className="type-card type-card--image no-overlay"
                  onClick={() => handleVariantSelect(variant.value)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) =>
                    e.key === 'Enter' && handleVariantSelect(variant.value)
                  }
                >
                  <img src={variant.imageUrl} alt={variant.label} className="type-card__image" />
                  <h3>{variant.label}</h3>
                  <p className="type-card__description">{variant.description}</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // Templates category - use 3-grid design with filtered types
  if (category === IMAGE_STUDIO_CATEGORIES.TEMPLATES) {
    return (
      <div className="type-selector-screen">
        <div className="type-selector-content">
          <div className="type-selector-header-wrapper">
            <h1>
              Wie soll dein Sharepic aussehen?
              <StatusBadge type="early-access" variant="inline" />
            </h1>
          </div>
          <div className="type-options-grid type-options-grid--three">
            {typesInCategory.map((config) => {
              const Icon = config.icon || HiPhotograph;
              return config.previewImage ? (
                <div
                  key={config.id}
                  className={`type-card type-card--image no-overlay ${config.isBeta ? 'beta' : ''}`}
                  onClick={() => handleTypeSelect(config.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) =>
                    e.key === 'Enter' && handleTypeSelect(config.id)
                  }
                >
                  {config.isBeta && <span className="beta-badge">Beta</span>}
                  <img src={config.previewImage} alt={config.label} className="type-card__image" />
                  <h3>{config.label}</h3>
                </div>
              ) : (
                <div
                  key={config.id}
                  className={`type-card ${config.isBeta ? 'beta' : ''}`}
                  onClick={() => handleTypeSelect(config.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) =>
                    e.key === 'Enter' && handleTypeSelect(config.id)
                  }
                >
                  {config.isBeta && <span className="beta-badge">Beta</span>}
                  <div className="type-icon">
                    <Icon />
                  </div>
                  <h3>{config.label}</h3>
                  <p>{config.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Standard type selector fallback (should not be reached with current flow)
  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <div className="type-selector-header-wrapper">
          <h1>{categoryConfig?.label}</h1>
          <p className="type-selector-intro">{categoryConfig?.description}</p>
        </div>
        <div className="type-options-grid">
          {typesInCategory.map((config) => {
            const Icon = config.icon || HiPhotograph;
            return config.previewImage ? (
              <div
                key={config.id}
                className={`type-card type-card--image ${config.isBeta ? 'beta' : ''}`}
                onClick={() => handleTypeSelect(config.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) =>
                  e.key === 'Enter' && handleTypeSelect(config.id)
                }
              >
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <img src={config.previewImage} alt={config.label} className="type-card__image" />
                <h3>{config.label}</h3>
              </div>
            ) : (
              <div
                key={config.id}
                className={`type-card ${config.isBeta ? 'beta' : ''}`}
                onClick={() => handleTypeSelect(config.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) =>
                  e.key === 'Enter' && handleTypeSelect(config.id)
                }
              >
                {config.isBeta && <span className="beta-badge">Beta</span>}
                <div className="type-icon">
                  <Icon />
                </div>
                <h3>{config.label}</h3>
                <p>{config.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImageStudioTypeSelector;
