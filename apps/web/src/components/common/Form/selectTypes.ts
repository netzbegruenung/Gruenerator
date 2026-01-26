/**
 * Centralized React-Select Type Definitions
 *
 * React-Select v5 uses complex generics: Select<Option, IsMulti, Group>
 * This module provides properly typed base interfaces and utilities to
 * eliminate TS2345 (argument mismatch) errors throughout the codebase.
 */

import type {
  GroupBase,
  StylesConfig,
  MultiValue,
  SingleValue,
  ActionMeta,
  SelectInstance,
  Props as SelectProps,
} from 'react-select';

// ============================================================================
// BASE OPTION INTERFACES
// ============================================================================

/**
 * Base option interface for all select components.
 * Extends this for custom option types.
 */
export interface BaseSelectOption {
  value: string | number;
  label: string;
  [key: string]: unknown;
}

/**
 * String-only option (most common case)
 */
export interface StringSelectOption {
  value: string;
  label: string;
}

/**
 * Enhanced option with additional metadata
 */
export interface EnhancedSelectOption extends BaseSelectOption {
  icon?: string;
  subtitle?: string;
  disabled?: boolean;
  isDisabled?: boolean;
  category?: string;
  description?: string;
}

/**
 * Option with recent value tracking
 */
export interface RecentValueOption extends BaseSelectOption {
  __isRecentValue?: boolean;
  __recentIndex?: number;
}

/**
 * Grouped option structure
 */
export interface GroupedOption<T extends BaseSelectOption = BaseSelectOption> {
  label: string;
  options: T[];
}

// ============================================================================
// CHANGE HANDLER TYPES
// ============================================================================

/**
 * Type-safe onChange handler for react-select
 * Works for both single and multi-select modes
 */
export type SelectChangeHandler<T extends BaseSelectOption, IsMulti extends boolean = false> = (
  newValue: IsMulti extends true ? MultiValue<T> : SingleValue<T>,
  actionMeta: ActionMeta<T>
) => void;

/**
 * Simplified onChange that only receives the value
 * Useful when you don't need actionMeta
 */
export type SimpleSelectChangeHandler<T extends BaseSelectOption> = (value: T | T[] | null) => void;

/**
 * Extract the value type from selection
 */
export type ExtractSelectValue<
  T extends BaseSelectOption,
  IsMulti extends boolean,
> = IsMulti extends true ? T[] : T | null;

// ============================================================================
// STYLES CONFIG TYPE
// ============================================================================

/**
 * Properly typed StylesConfig that matches react-select generics
 */
export type TypedStylesConfig<
  T extends BaseSelectOption = BaseSelectOption,
  IsMulti extends boolean = false,
> = StylesConfig<T, IsMulti, GroupBase<T>>;

// ============================================================================
// REF TYPES
// ============================================================================

/**
 * Properly typed ref for react-select instance
 */
export type SelectRef<
  T extends BaseSelectOption = BaseSelectOption,
  IsMulti extends boolean = false,
> = SelectInstance<T, IsMulti, GroupBase<T>> | null;

// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

/**
 * Base props for wrapping react-select
 */
export type BaseSelectProps<
  T extends BaseSelectOption = BaseSelectOption,
  IsMulti extends boolean = false,
> = Omit<SelectProps<T, IsMulti, GroupBase<T>>, 'onChange'> & {
  onChange?: SelectChangeHandler<T, IsMulti>;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Type guard to check if a value is a valid select option
 */
export function isSelectOption(value: unknown): value is BaseSelectOption {
  return value !== null && typeof value === 'object' && 'value' in value && 'label' in value;
}

/**
 * Type guard to check if value is multi-select (array of options)
 */
export function isMultiValue<T extends BaseSelectOption>(
  value: SingleValue<T> | MultiValue<T>
): value is MultiValue<T> {
  return Array.isArray(value);
}

/**
 * Type guard to check if value is single-select
 */
export function isSingleValue<T extends BaseSelectOption>(
  value: SingleValue<T> | MultiValue<T>
): value is SingleValue<T> {
  return !Array.isArray(value);
}

/**
 * Safely extract values from multi or single select
 */
export function extractSelectValues<T extends BaseSelectOption>(
  value: SingleValue<T> | MultiValue<T>
): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return [...value];
  return [value as T];
}

/**
 * Convert array of primitives to select options
 */
export function toSelectOptions<T extends string | number>(
  values: T[],
  labelFn?: (value: T) => string
): StringSelectOption[] {
  return values.map((v) => ({
    value: String(v),
    label: labelFn ? labelFn(v) : String(v),
  }));
}

/**
 * Find option by value in options array
 */
export function findOptionByValue<T extends BaseSelectOption>(
  options: T[] | readonly T[],
  value: string | number | null | undefined
): T | undefined {
  if (value === null || value === undefined) return undefined;
  return options.find((opt) => opt.value === value);
}

/**
 * Find multiple options by values
 */
export function findOptionsByValues<T extends BaseSelectOption>(
  options: T[] | readonly T[],
  values: (string | number)[] | null | undefined
): T[] {
  if (!values || values.length === 0) return [];
  return options.filter((opt) => values.includes(opt.value as string | number));
}
