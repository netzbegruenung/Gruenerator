/**
 * Shared TypeScript type definitions for the custom generators feature.
 * This file consolidates type definitions that were previously duplicated across
 * CustomGeneratorPage.tsx, CreateCustomGeneratorPage.tsx, and FieldEditorAssistant.tsx
 */

/**
 * Represents an option in a select field
 */
export interface SelectOption {
  label: string;
  value: string;
}

/**
 * Unified form field interface (replaces 3 duplicate definitions)
 * Previously defined as:
 * - FormField in CustomGeneratorPage.tsx
 * - FormField in CreateCustomGeneratorPage.tsx
 * - FieldData in FieldEditorAssistant.tsx
 */
export interface GeneratorFormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: SelectOption[];
}

/**
 * Configuration for a custom generator instance
 */
export interface GeneratorConfig {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  slug: string;
  is_owner?: boolean;
  is_saved?: boolean;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
  form_schema: {
    fields: GeneratorFormField[];
  };
}

/**
 * Form data structure for creating a new generator
 */
export interface GeneratorFormData {
  name: string;
  slug: string;
  fields: GeneratorFormField[];
  prompt: string;
  title: string;
  description: string;
  contact_email: string;
}

/**
 * Feature toggle flags for generator forms
 */
export interface FeatureToggles {
  useWebSearchTool: boolean;
  usePrivacyMode: boolean;
  useBedrock: boolean;
}

/**
 * Default values for feature toggles
 * Used across all generators to provide consistent initial state
 */
export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  useWebSearchTool: false,
  usePrivacyMode: false,
  useBedrock: false,
};

/**
 * Type alias for backward compatibility
 * Can be removed after all files are migrated to GeneratorFormField
 */
export type FormField = GeneratorFormField;

/**
 * Type alias for backward compatibility with FieldEditorAssistant
 * Can be removed after FieldEditorAssistant is refactored
 */
export type FieldData = GeneratorFormField;
