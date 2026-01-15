/**
 * Image Studio constants and enums
 */

export const IMAGE_STUDIO_CATEGORIES = {
  TEMPLATES: 'templates',
  KI: 'ki'
} as const;

export type ImageStudioCategory = typeof IMAGE_STUDIO_CATEGORIES[keyof typeof IMAGE_STUDIO_CATEGORIES];

export const KI_SUBCATEGORIES = {
  EDIT: 'edit',
  CREATE: 'create'
} as const;

export type KiSubcategory = typeof KI_SUBCATEGORIES[keyof typeof KI_SUBCATEGORIES];

export const IMAGE_STUDIO_TYPES = {
  // Template types (canvas-based)
  DREIZEILEN: 'dreizeilen',
  ZITAT: 'zitat',
  ZITAT_PURE: 'zitat-pure',
  INFO: 'info',
  VERANSTALTUNG: 'veranstaltung',
  PROFILBILD: 'profilbild',
  SIMPLE: 'simple',

  // KI types (FLUX API-based)
  GREEN_EDIT: 'green-edit',
  ALLY_MAKER: 'ally-maker',
  UNIVERSAL_EDIT: 'universal-edit',
  PURE_CREATE: 'pure-create',
  AI_EDITOR: 'ai-editor'
} as const;

export type ImageStudioType = typeof IMAGE_STUDIO_TYPES[keyof typeof IMAGE_STUDIO_TYPES];

export const FORM_STEPS = {
  CATEGORY_SELECT: 'CATEGORY_SELECT',
  TYPE_SELECT: 'TYPE_SELECT',
  IMAGE_UPLOAD: 'IMAGE_UPLOAD',
  IMAGE_SIZE_SELECT: 'IMAGE_SIZE_SELECT',
  INPUT: 'INPUT',
  PREVIEW: 'PREVIEW',
  CANVAS_EDIT: 'CANVAS_EDIT',
  RESULT: 'RESULT'
} as const;

export type FormStep = typeof FORM_STEPS[keyof typeof FORM_STEPS];

export const URL_TYPE_MAP: Record<string, ImageStudioType> = {
  'dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
  'zitat': IMAGE_STUDIO_TYPES.ZITAT,
  'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
  'info': IMAGE_STUDIO_TYPES.INFO,
  'veranstaltung': IMAGE_STUDIO_TYPES.VERANSTALTUNG,
  'profilbild': IMAGE_STUDIO_TYPES.PROFILBILD,
  'green-edit': IMAGE_STUDIO_TYPES.GREEN_EDIT,
  'ally-maker': IMAGE_STUDIO_TYPES.ALLY_MAKER,
  'universal-edit': IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT,
  'pure-create': IMAGE_STUDIO_TYPES.PURE_CREATE,
  'ai-editor': IMAGE_STUDIO_TYPES.AI_EDITOR
};
