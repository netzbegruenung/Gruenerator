import {
  CANVAS_FORMATS,
  CANVAS_FORMAT_GROUP_LABEL,
  CANVAS_FORMAT_GROUP_ORDER,
  DEFAULT_FORMAT_ID,
  type CanvasFormat,
  type CanvasFormatGroup,
} from '@gruenerator/canvas-editor/formats';
import React, { useMemo, useCallback, useState, useDeferredValue } from 'react';
import { HiExternalLink, HiPhotograph } from 'react-icons/hi';
import { PiMagnifyingGlass } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { StatusBadge } from '../../../components/common/StatusBadge';
import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
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

// Brand color per format group — drives the FeatureCard backgroundColor when
// no preview image is available. Picked from CANVAS_COLORS in shared/canvas-editor.
const GROUP_BACKGROUND: Record<CanvasFormatGroup, string> = {
  sharepic: '#005538', // TANNE
  story: '#0BA1DD', // HIMMEL
  praesentation: '#008939', // KLEE
  flyer: '#46962b', // KLEE-alt
  plakat: '#2E2E3D', // DUNKELGRAU
};

interface FormatBrowserProps {
  activeFormatId: string;
  onSelect: (id: string) => void;
}

const FormatBrowser: React.FC<FormatBrowserProps> = ({ activeFormatId, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  const grouped = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const matchesQuery = (f: CanvasFormat) =>
      !q ||
      f.label.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      CANVAS_FORMAT_GROUP_LABEL[f.group].toLowerCase().includes(q);

    const out: Record<CanvasFormatGroup, CanvasFormat[]> = {
      sharepic: [],
      story: [],
      praesentation: [],
      flyer: [],
      plakat: [],
    };
    for (const f of CANVAS_FORMATS) {
      if (matchesQuery(f)) out[f.group].push(f);
    }
    return out;
  }, [deferredQuery]);

  const totalMatches = CANVAS_FORMAT_GROUP_ORDER.reduce((acc, g) => acc + grouped[g].length, 0);

  return (
    <div className="mt-lg text-left">
      <div className="relative max-w-[500px] mx-auto mb-lg">
        <PiMagnifyingGlass className="absolute left-md top-1/2 -translate-y-1/2 text-grey-400 text-lg" />
        <input
          type="text"
          placeholder="Format suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-2xl pr-md py-sm bg-background border border-grey-200 dark:border-grey-700 rounded-lg text-base text-foreground placeholder:text-grey-400 focus:outline-none focus:border-primary-500 transition-colors"
        />
      </div>

      {totalMatches === 0 ? (
        <p className="text-center text-foreground-muted text-sm py-md">
          Keine Formate für „{searchQuery}&ldquo; gefunden
        </p>
      ) : (
        CANVAS_FORMAT_GROUP_ORDER.map((group) => {
          const formats = grouped[group];
          if (formats.length === 0) return null;
          return (
            <div key={group} className="mb-xl">
              <h2 className="text-xl font-semibold text-foreground-heading mt-lg mb-md text-center">
                {CANVAS_FORMAT_GROUP_LABEL[group]}
              </h2>
              <div className="grid grid-cols-3 gap-8 max-[1024px]:grid-cols-2 max-[1024px]:gap-6 max-[768px]:grid-cols-2 max-[768px]:gap-4 max-[480px]:grid-cols-1">
                {formats.map((f) => (
                  <TypeCard
                    key={f.id}
                    onClick={() => onSelect(f.id)}
                    label={f.label}
                    description={f.description}
                    backgroundColor={GROUP_BACKGROUND[f.group]}
                    className={cn(
                      'aspect-[3/4]',
                      activeFormatId === f.id && 'ring-2 ring-primary-600 ring-offset-2'
                    )}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

const ImageStudioTypeSelector: React.FC = () => {
  const navigate = useNavigate();
  const category = useImageStudioStore((state) => state.category);
  const setType = useImageStudioStore((state) => state.setType);
  const selectedFormatId = useImageStudioStore((state) => state.selectedFormatId);
  const updateFormData = useImageStudioStore((state) => state.updateFormData);

  const activeFormatId = selectedFormatId ?? DEFAULT_FORMAT_ID;

  const user = useAuthStore((s) => s.user);
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
        void navigate(`/imagine/${urlSegment}`);
      } else {
        void navigate(`/studio/${config?.category || category}/${urlSegment}`);
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
      void navigate(`/imagine/pure-create`);
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

          {/* Format selection — recherche-page style: section headers per group
              with a search box. Choice is written to the store before the user
              picks a template, so the editor opens with the correct dimensions. */}
          <FormatBrowser
            activeFormatId={activeFormatId}
            onSelect={(id) => updateFormData({ selectedFormatId: id })}
          />

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
