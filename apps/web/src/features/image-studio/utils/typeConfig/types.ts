/**
 * TypeScript interfaces for Image Studio type configuration
 */
import type { IconType } from 'react-icons';

export interface VariantStyle {
  label: string;
  imageName: string;
  description: string;
}

export interface VariantTypeConfig {
  basePath: string;
  valueMap: Record<string, string>;
}

export interface Variant {
  value: string;
  label: string;
  description: string;
  imageUrl: string;
}

export interface FormProps {
  label: string;
  placeholder: string;
  helpText?: string;
  rows?: number;
}

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  message: string;
}

export interface PlacementOption {
  value: string;
  label: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface InputField {
  name: string;
  type: 'text' | 'textarea' | 'select';
  label: string;
  subtitle?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  options?: SelectOption[];
}

export interface PreviewField {
  name: string;
  type: 'text' | 'textarea';
  label: string;
  placeholder?: string;
  rows?: number;
}

export interface Endpoints {
  text?: string;
  canvas?: string;
  generate?: string;
  backgroundRemoval?: string;
}

export interface TypeConfigBase {
  id: string;
  category: string;
  subcategory?: string;
  label: string;
  description: string;
  icon: IconType;
  previewImage?: string;
  hidden?: boolean;
  isBeta?: boolean;
  excludeFromTemplates?: boolean;
  requiresImage: boolean;
  hasTextGeneration: boolean;
  hasTextCanvasEdit?: boolean;
  inputBeforeImage?: boolean;
  parallelPreload?: boolean;
  usesFluxApi: boolean;
  hasRateLimit: boolean;
  hasAiEditor?: boolean;
  hasPrecisionMode?: boolean;
  alwaysPrecision?: boolean;
  hasBackgroundRemoval?: boolean;
  endpoints: Endpoints;
  formComponent?: string;
  steps: string[];
  legacyType?: string;
  urlSlug?: string;
  formProps?: FormProps;
  validation?: Record<string, ValidationRule>;
  placementOptions?: PlacementOption[];
  variants?: Variant[];
}

export interface TemplateTypeConfig extends TypeConfigBase {
  category: 'templates';
}

export interface KiTypeConfig extends TypeConfigBase {
  category: 'ki';
  subcategory: 'edit' | 'create';
}

export type TypeConfig = TemplateTypeConfig | KiTypeConfig;

export type ResponseMapper<T = Record<string, unknown>> = (
  result: T
) => Record<string, string | string[]>;
export type AlternativesMapper<T = Record<string, unknown>> = (
  alt: T,
  index?: number
) => Record<string, string>;

export interface TemplateFieldConfig {
  inputFields: InputField[];
  previewFields: PreviewField[];
  resultFields: string[];
  responseMapping?: ResponseMapper;
  alternativesMapping?: AlternativesMapper;
  afterLastInputTrigger?: string;
  showPreviewLabels?: boolean;
  showImageUpload: boolean;
  showColorControls: boolean;
  showFontSizeControl: boolean;
  showGroupedFontSizeControl?: boolean;
  showAdvancedEditing: boolean;
  showCredit: boolean;
  showAlternatives: boolean;
  showEditPanel: boolean;
  showAutoSave: boolean;
  showSocialGeneration: boolean;
  alternativesButtonText?: string;
  skipSloganStep?: boolean;
  minimalLayout?: boolean;
}

export interface CategoryConfig {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  icon: IconType;
  types: string[];
  hasRateLimit?: boolean;
  hasSubcategories?: boolean;
}

export interface SubcategoryConfig {
  id: string;
  label: string;
  description: string;
  icon: IconType;
  previewImage: string;
}

export type TypeConfigMap = Record<string, TypeConfig>;
export type TemplateFieldConfigMap = Record<string, TemplateFieldConfig>;
export type CategoryConfigMap = Record<string, CategoryConfig>;
export type SubcategoryConfigMap = Record<string, SubcategoryConfig>;
