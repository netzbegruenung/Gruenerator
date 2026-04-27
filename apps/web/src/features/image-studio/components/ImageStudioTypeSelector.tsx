import {
  CANVAS_FORMATS,
  CANVAS_FORMAT_GROUP_LABEL,
  type CanvasFormatGroup,
} from '@gruenerator/canvas-editor/formats';
import React, { useMemo, useCallback, useState, useDeferredValue } from 'react';
import { HiExternalLink, HiPhotograph } from 'react-icons/hi';
import { PiMagnifyingGlass } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { StatusBadge } from '../../../components/common/StatusBadge';
import { useAuthStore } from '../../../stores/authStore';
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

// Brand color per format group — used as TypeCard backdrop when a variant has
// no previewImage. Picked from CANVAS_COLORS in shared/canvas-editor.
const GROUP_BACKGROUND: Record<CanvasFormatGroup, string> = {
  sharepic: '#005538', // TANNE
  story: '#0BA1DD', // HIMMEL
  praesentation: '#008939', // KLEE
  flyer: '#46962b', // KLEE-alt
  plakat: '#2E2E3D', // DUNKELGRAU
};

// Section topology for the picker. Print collapses Flyer + Plakat into one
// section because they share the print-export workflow (PDF/PNG @ 300 dpi)
// and the user wants them browsed together.
interface SectionDef {
  key: string;
  label: string;
  groups: readonly CanvasFormatGroup[];
}

const SECTION_DEFS: readonly SectionDef[] = [
  { key: 'sharepic', label: CANVAS_FORMAT_GROUP_LABEL.sharepic, groups: ['sharepic'] },
  { key: 'story', label: CANVAS_FORMAT_GROUP_LABEL.story, groups: ['story'] },
  {
    key: 'praesentation',
    label: CANVAS_FORMAT_GROUP_LABEL.praesentation,
    groups: ['praesentation'],
  },
  { key: 'print', label: 'Print', groups: ['flyer', 'plakat'] },
];

interface FormatBrowserProps {
  variants: TypeConfig[];
  onSelect: (variantId: string, formatId: string) => void;
}

const FormatBrowser: React.FC<FormatBrowserProps> = ({ variants, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  // Build sections from SECTION_DEFS — most are 1:1 with a CanvasFormatGroup,
  // but "Print" merges flyer + plakat into a single section.
  const sections = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return SECTION_DEFS.map((def) => {
      const formats = CANVAS_FORMATS.filter((f) => def.groups.includes(f.group));
      if (formats.length === 0) return null;

      const sectionHit =
        !q ||
        def.label.toLowerCase().includes(q) ||
        formats.some(
          (f) =>
            f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
        );

      const sectionVariants = variants.filter((v) => {
        const supported = v.supportedFormatGroups ?? ['sharepic'];
        return def.groups.some((g) => supported.includes(g));
      });
      const visibleVariants = sectionVariants.filter((v) => {
        if (sectionHit) return true;
        return v.label.toLowerCase().includes(q) || (v.description ?? '').toLowerCase().includes(q);
      });
      return { def, formats, variants: visibleVariants };
    })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .filter((s) => s.variants.length > 0);
  }, [deferredQuery, variants]);

  return (
    <div className="mt-lg text-left">
      <div className="relative max-w-[500px] mx-auto mb-lg">
        <PiMagnifyingGlass className="absolute left-md top-1/2 -translate-y-1/2 text-grey-400 text-lg" />
        <input
          type="text"
          placeholder="Format oder Vorlage suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-2xl pr-md py-sm bg-background border border-grey-200 dark:border-grey-700 rounded-lg text-base text-foreground placeholder:text-grey-400 focus:outline-none focus:border-primary-500 transition-colors"
        />
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-foreground-muted text-sm py-md">
          Keine Ergebnisse für „{searchQuery}&ldquo;
        </p>
      ) : (
        sections.map(({ def, formats, variants: secVariants }) => {
          const isMultiSize = formats.length > 1;
          const isMergedSection = def.groups.length > 1;
          // Card-label rule:
          //  - merged section (Print): full format label "Flyer A5" — needed
          //    to distinguish across groups inside the section.
          //  - single-group multi-size (Präsentation): strip the group prefix
          //    so cards read "16:9", "4:3".
          //  - single-group single-size (Sharepics, Story): show the variant
          //    label since the size is redundant.
          return (
            <div key={def.key} className="mb-xl">
              <h2 className="text-xl font-semibold text-foreground-heading mt-lg mb-md text-left">
                {def.label}
              </h2>
              <div className="grid grid-cols-5 gap-4 max-[1280px]:grid-cols-4 max-[1024px]:grid-cols-3 max-[768px]:grid-cols-3 max-[480px]:grid-cols-2">
                {secVariants.flatMap((v) =>
                  formats.map((f) => {
                    const authoredHere = (v.primaryFormatGroup ?? 'sharepic') === f.group;
                    const effectivePreview = authoredHere ? v.previewImage : undefined;
                    const effectivePreviewFallback = authoredHere
                      ? v.previewImageFallback
                      : undefined;
                    const fallbackBg = !effectivePreview ? GROUP_BACKGROUND[f.group] : undefined;
                    const cardLabel = isMergedSection
                      ? f.label
                      : isMultiSize
                        ? f.label.replace(`${def.label} `, '')
                        : v.label;
                    return (
                      <TypeCard
                        key={`${def.key}-${v.id}-${f.id}`}
                        onClick={() => onSelect(v.id, f.id)}
                        previewImage={effectivePreview}
                        previewImageFallback={effectivePreviewFallback}
                        label={cardLabel}
                        description={isMultiSize ? f.description : v.description}
                        backgroundColor={fallbackBg}
                        className="aspect-[3/4]"
                        badge={v.isBeta ? <StatusBadge type="beta" variant="card" /> : undefined}
                      />
                    );
                  })
                )}
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
  const updateFormData = useImageStudioStore((state) => state.updateFormData);

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

  // Templates category — merged picker: section per (format × variant) so a
  // single click sets both `type` and `format`. No separate format-vs-variant
  // step; sharepic variants are listed under "Sharepics" (one size only) and
  // repeated per size in multi-size groups (Flyer A4, Plakat A3, etc.).
  if (category === IMAGE_STUDIO_CATEGORIES.TEMPLATES) {
    const handleVariantWithFormat = (variantId: string, formatId: string) => {
      setType(variantId);
      updateFormData({ selectedFormatId: formatId });
      const config = getTypeConfig(variantId) as TypeConfig | null;
      const urlSegment = config?.urlSlug || variantId;
      void navigate(`/studio/${config?.category || category}/${urlSegment}`);
    };

    return (
      <div className="w-full flex justify-center p-8 max-[768px]:p-4">
        <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-sm flex-wrap">
              Was möchtest du erstellen?
              <StatusBadge type="early-access" variant="inline" />
            </h1>
          </div>

          <FormatBrowser variants={typesInCategory} onSelect={handleVariantWithFormat} />
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
