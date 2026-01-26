import { useMemo } from 'react';

/**
 * Generic config resolver with type safety
 *
 * Priority: Store config → Prop value → Default value
 *
 * @template T - The config object type
 * @param storeConfig - Configuration from store (lowest priority)
 * @param propConfig - Configuration from component props (highest priority)
 * @param defaults - Default configuration values (fallback)
 * @returns Resolved configuration with all values merged
 *
 * @example
 * ```typescript
 * interface MyConfig {
 *   enabled: boolean;
 *   label: string;
 *   count: number;
 * }
 *
 * const resolved = useResolvedConfig<MyConfig>(
 *   { enabled: false, count: 5 },  // from store
 *   { label: 'Custom' },            // from props
 *   { enabled: true, label: 'Default', count: 0 }  // defaults
 * );
 * // Result: { enabled: false, label: 'Custom', count: 5 }
 * ```
 */
export function useResolvedConfig<T extends Record<string, unknown>>(
  storeConfig: Partial<T>,
  propConfig: Partial<T> | null | undefined,
  defaults: T
): T {
  return useMemo(() => {
    const resolved: T = { ...defaults };

    // Apply store values (medium priority)
    (Object.keys(storeConfig) as Array<keyof T>).forEach((key) => {
      if (storeConfig[key] !== undefined) {
        resolved[key] = storeConfig[key] as T[keyof T];
      }
    });

    // Apply prop values (highest priority)
    if (propConfig) {
      (Object.keys(propConfig) as Array<keyof T>).forEach((key) => {
        if (propConfig[key] !== undefined) {
          resolved[key] = propConfig[key] as T[keyof T];
        }
      });
    }

    return resolved;
  }, [storeConfig, propConfig, defaults]);
}

/**
 * Type guard for checking if an object matches a config structure
 *
 * @template T - The expected config type
 * @param value - Value to check
 * @param requiredKeys - Keys that must be present in the config
 * @returns True if value matches config structure
 *
 * @example
 * ```typescript
 * interface FeatureConfig {
 *   enabled: boolean;
 *   label: string;
 * }
 *
 * const value: unknown = { enabled: true, label: 'Test' };
 *
 * if (isValidConfig<FeatureConfig>(value, ['enabled', 'label'])) {
 *   // value is now typed as FeatureConfig
 *   console.log(value.enabled, value.label);
 * }
 * ```
 */
export function isValidConfig<T>(value: unknown, requiredKeys: readonly (keyof T)[]): value is T {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return requiredKeys.every((key) => key in value);
}

/**
 * Merge multiple partial configs with type safety
 *
 * Later configs override earlier ones (right-to-left priority)
 *
 * @template T - The config object type
 * @param configs - Array of partial configs to merge
 * @returns Merged configuration
 *
 * @example
 * ```typescript
 * interface Config {
 *   enabled: boolean;
 *   label: string;
 *   count: number;
 * }
 *
 * const merged = mergeConfigs<Config>([
 *   { enabled: true, count: 1 },
 *   { label: 'Test' },
 *   { count: 5 }  // This count overrides the first one
 * ]);
 * // Result: { enabled: true, label: 'Test', count: 5 }
 * ```
 */
export function mergeConfigs<T extends Record<string, unknown>>(
  ...configs: Array<Partial<T> | null | undefined>
): Partial<T> {
  const result: Partial<T> = {};

  for (const config of configs) {
    if (!config) continue;

    (Object.keys(config) as Array<keyof T>).forEach((key) => {
      if (config[key] !== undefined) {
        result[key] = config[key];
      }
    });
  }

  return result;
}

/**
 * Extract a specific property from multiple configs with fallback
 *
 * Returns the first defined value found, or the fallback
 *
 * @template T - The config object type
 * @template K - The key type
 * @param key - Property key to extract
 * @param fallback - Fallback value if not found
 * @param configs - Configs to search through
 * @returns The extracted value or fallback
 *
 * @example
 * ```typescript
 * const label = extractConfigValue(
 *   'label',
 *   'Default Label',
 *   storeConfig,
 *   propConfig,
 *   { label: 'Fallback' }
 * );
 * ```
 */
export function extractConfigValue<T extends Record<string, unknown>, K extends keyof T>(
  key: K,
  fallback: T[K],
  ...configs: Array<Partial<T> | null | undefined>
): T[K] {
  for (const config of configs) {
    if (config && config[key] !== undefined) {
      return config[key] as T[K];
    }
  }

  return fallback;
}
