/**
 * Image Studio Type Configuration
 * Unified type system for Templates (sharepic) and KI (imagine) features
 *
 * This is the main entry point that provides backward compatibility
 * with the original typeConfig.js file structure.
 */
import { HiSparkles, HiPencilAlt } from 'react-icons/hi';
import { PiLayout } from 'react-icons/pi';

// Export constants
export {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  URL_TYPE_MAP,
} from './constants';
export type { ImageStudioCategory, ImageStudioType, KiSubcategory, FormStep } from './constants';

// Export types
export type {
  TypeConfig,
  TemplateTypeConfig,
  KiTypeConfig,
  TemplateFieldConfig,
  InputField,
  PreviewField,
  Variant,
  CategoryConfig,
  SubcategoryConfig,
  FormProps,
  ValidationRule,
  PlacementOption,
  SelectOption,
  Endpoints,
  ResponseMapper,
  AlternativesMapper,
} from './types';

// Export variant system
export { VARIANT_STYLES, VARIANT_TYPES, createVariants } from './variants';

// Import template and KI configs
import { IMAGE_STUDIO_CATEGORIES, KI_SUBCATEGORIES } from './constants';
import { kiTypeConfigs, kiFieldConfigs } from './ki';
import { templateTypeConfigs, templateFieldConfigs } from './templates';

import type { TypeConfig, TemplateFieldConfig, CategoryConfig, SubcategoryConfig } from './types';

// Combined TYPE_CONFIG for backward compatibility
export const TYPE_CONFIG: Record<string, TypeConfig> = {
  ...templateTypeConfigs,
  ...kiTypeConfigs,
};

// Combined TEMPLATE_FIELD_CONFIG for backward compatibility
export const TEMPLATE_FIELD_CONFIG: Record<string, TemplateFieldConfig> = {
  ...templateFieldConfigs,
  ...kiFieldConfigs,
};

// Category configuration
export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  [IMAGE_STUDIO_CATEGORIES.TEMPLATES]: {
    id: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Templates',
    subtitle: 'Design-basiert',
    description: 'Erstelle Sharepics mit vorgefertigten Designs',
    icon: PiLayout,
    types: Object.values(templateTypeConfigs)
      .filter((t) => !t.hidden && !t.excludeFromTemplates)
      .map((t) => t.id),
  },
  [IMAGE_STUDIO_CATEGORIES.KI]: {
    id: IMAGE_STUDIO_CATEGORIES.KI,
    label: 'KI-Powered',
    subtitle: 'AI-generiert',
    description: 'Erstelle und bearbeite Bilder mit künstlicher Intelligenz',
    icon: HiSparkles,
    hasRateLimit: true,
    hasSubcategories: true,
    types: Object.values(kiTypeConfigs)
      .filter((t) => !t.hidden)
      .map((t) => t.id),
  },
};

// KI Subcategory configuration
export const KI_SUBCATEGORY_CONFIG: Record<string, SubcategoryConfig> = {
  [KI_SUBCATEGORIES.EDIT]: {
    id: KI_SUBCATEGORIES.EDIT,
    label: 'Mit KI Editieren',
    description: 'Bestehende Bilder mit KI bearbeiten',
    icon: HiPencilAlt,
    previewImage: '/imagine/green-street-example.png',
  },
  [KI_SUBCATEGORIES.CREATE]: {
    id: KI_SUBCATEGORIES.CREATE,
    label: 'Mit KI Generieren',
    description: 'Neue Bilder aus Text erstellen',
    icon: HiSparkles,
    previewImage: '/imagine/variants-pure/soft-illustration.png',
  },
};

// Helper functions for backward compatibility
export const getTemplateFieldConfig = (typeId: string): TemplateFieldConfig | null =>
  TEMPLATE_FIELD_CONFIG[typeId] || null;

export const getTypeConfig = (typeId: string): TypeConfig | null => TYPE_CONFIG[typeId] || null;

export const getCategoryConfig = (categoryId: string): CategoryConfig | null =>
  CATEGORY_CONFIG[categoryId] || null;

export const getTypesForCategory = (categoryId: string, includeExcluded = false): TypeConfig[] => {
  const category = CATEGORY_CONFIG[categoryId];
  if (!category) return [];
  return category.types
    .map((typeId) => TYPE_CONFIG[typeId])
    .filter(
      (t): t is TypeConfig =>
        t !== undefined && !t.hidden && (includeExcluded || !t.excludeFromTemplates)
    );
};

export const getAllKiTypes = (): TypeConfig[] => {
  return Object.values(kiTypeConfigs).filter((t) => !t.hidden);
};

export const getTypesForSubcategory = (subcategoryId: string): TypeConfig[] => {
  return Object.values(kiTypeConfigs).filter((t) => t.subcategory === subcategoryId && !t.hidden);
};

export const getSubcategoryConfig = (subcategoryId: string): SubcategoryConfig | null =>
  KI_SUBCATEGORY_CONFIG[subcategoryId] || null;

export const getLegacyType = (typeId: string): string | null => {
  const config = TYPE_CONFIG[typeId];
  return config?.legacyType || null;
};

export const getTypeFromLegacy = (legacyType: string): string | null => {
  const entry = Object.entries(TYPE_CONFIG).find(([, config]) => config.legacyType === legacyType);
  return entry ? entry[0] : null;
};

// Default export for backward compatibility
export default {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES: Object.fromEntries(
    Object.entries(TYPE_CONFIG).map(([key, config]) => [
      key.toUpperCase().replace(/-/g, '_'),
      config.id,
    ])
  ),
  KI_SUBCATEGORIES,
  FORM_STEPS: {
    CATEGORY_SELECT: 'CATEGORY_SELECT',
    TYPE_SELECT: 'TYPE_SELECT',
    IMAGE_UPLOAD: 'IMAGE_UPLOAD',
    INPUT: 'INPUT',
    PREVIEW: 'PREVIEW',
    CANVAS_EDIT: 'CANVAS_EDIT',
    RESULT: 'RESULT',
  },
  TYPE_CONFIG,
  CATEGORY_CONFIG,
  KI_SUBCATEGORY_CONFIG,
  TEMPLATE_FIELD_CONFIG,
  getTypeConfig,
  getCategoryConfig,
  getTypesForCategory,
  getAllKiTypes,
  getTypesForSubcategory,
  getSubcategoryConfig,
  getTemplateFieldConfig,
  getLegacyType,
  getTypeFromLegacy,
  URL_TYPE_MAP: Object.fromEntries(
    Object.entries(TYPE_CONFIG).map(([, config]) => [config.id, config.id])
  ),
};
