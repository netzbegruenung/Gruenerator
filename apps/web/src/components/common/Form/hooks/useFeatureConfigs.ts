import { useMemo, useCallback } from 'react';

import { useResolvedConfig, mergeConfigs } from '../utils/configResolver';

import type { WebSearchConfig, PrivacyModeConfig, ProModeConfig } from '../FormStateProvider';
import type { FeatureToggle, FeatureConfig, FeaturesConfig } from '@/types/baseform';

// =============================================================================
// Resolved Config Interfaces
// =============================================================================

export interface ResolvedFeatureConfig {
  enabled: boolean;
  toggle?: FeatureToggle;
  isActive: boolean;
  isSearching?: boolean;
  statusMessage?: string;
}

// =============================================================================
// Hook Parameters
// =============================================================================

interface UseFeatureConfigsParams {
  // NEW: Consolidated features prop (preferred)
  features?: FeaturesConfig;

  // DEPRECATED: Individual feature props (backward compatibility)
  webSearchFeatureToggle?: FeatureToggle | null;
  useWebSearchFeatureToggle?: boolean;
  webSearchConfig?: { isActive?: boolean; isSearching?: boolean; statusMessage?: string } | null;

  privacyModeToggle?: FeatureToggle | null;
  usePrivacyModeToggle?: boolean;
  privacyModeConfig?: { isActive?: boolean } | null;

  proModeToggle?: FeatureToggle | null;
  useProModeToggle?: boolean;
  proModeConfig?: { isActive?: boolean } | null;

  interactiveModeToggle?: FeatureToggle | null;
  useInteractiveModeToggle?: boolean;
  interactiveModeConfig?: { isActive?: boolean } | null;

  // Store configurations
  storeWebSearchConfig: WebSearchConfig;
  storePrivacyModeConfig: PrivacyModeConfig;
  storeProModeConfig: ProModeConfig;
}

// =============================================================================
// Feature Names Type
// =============================================================================

type FeatureName = 'webSearch' | 'privacyMode' | 'proMode' | 'interactiveMode';

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Resolves feature configurations from multiple sources
 *
 * Priority order:
 * 1. New consolidated `features` prop (highest priority)
 * 2. Legacy individual props (for backward compatibility)
 * 3. Store configuration (lowest priority)
 *
 * Emits deprecation warnings in development when legacy props are used.
 *
 * @example
 * ```typescript
 * // NEW WAY (preferred):
 * const { resolvedWebSearchConfig } = useFeatureConfigs({
 *   features: {
 *     webSearch: {
 *       enabled: true,
 *       toggle: { isActive: true, label: 'Web Search' },
 *       config: { isSearching: false }
 *     }
 *   },
 *   storeWebSearchConfig,
 *   storePrivacyModeConfig,
 *   storeProModeConfig
 * });
 *
 * // OLD WAY (still supported):
 * const { resolvedWebSearchConfig } = useFeatureConfigs({
 *   webSearchFeatureToggle: { isActive: true, label: 'Web Search' },
 *   useWebSearchFeatureToggle: true,
 *   storeWebSearchConfig,
 *   ...
 * });
 * ```
 */
export function useFeatureConfigs(params: UseFeatureConfigsParams) {
  const {
    features,
    webSearchFeatureToggle,
    useWebSearchFeatureToggle,
    webSearchConfig,
    storeWebSearchConfig,
    privacyModeToggle,
    usePrivacyModeToggle,
    privacyModeConfig,
    storePrivacyModeConfig,
    proModeToggle,
    useProModeToggle,
    proModeConfig,
    storeProModeConfig,
    interactiveModeToggle,
    useInteractiveModeToggle,
    interactiveModeConfig,
  } = params;

  // Generic feature resolver with deprecation warnings
  const resolveFeature = useCallback(
    (
      featureName: FeatureName,
      newConfig: FeatureConfig | undefined,
      legacyToggle: FeatureToggle | null | undefined,
      legacyEnabled: boolean | undefined,
      legacyConfig: Record<string, unknown> | null | undefined,
      storeConfig: Record<string, unknown>
    ): ResolvedFeatureConfig => {
      // Emit deprecation warning in dev mode
      if (process.env.NODE_ENV === 'development') {
        const hasLegacyProps =
          legacyToggle !== undefined || legacyEnabled !== undefined || legacyConfig !== undefined;
        const hasNewConfig = newConfig !== undefined;

        if (hasLegacyProps && !hasNewConfig) {
          console.warn(
            `[BaseForm] Deprecated: Use features.${featureName} instead of individual ${featureName} props.`,
            `\nSee: https://docs.example.com/migrations/baseform-props`
          );
        }
      }

      // Merge legacy props into new structure if features prop is not provided
      const effectiveConfig: FeatureConfig = newConfig || {
        enabled: legacyEnabled,
        toggle: legacyToggle ?? undefined,
        config: legacyConfig ?? undefined,
      };

      // Build resolved config with proper defaults
      const storeEnabled = 'enabled' in storeConfig ? (storeConfig.enabled as boolean) : false;
      const storeIsActive = 'isActive' in storeConfig ? (storeConfig.isActive as boolean) : false;

      const resolved: ResolvedFeatureConfig = {
        enabled: effectiveConfig.enabled ?? storeEnabled ?? false,
        toggle: effectiveConfig.toggle,
        isActive: effectiveConfig.config?.isActive ?? storeIsActive ?? false,
      };

      // Add web search specific fields
      if (featureName === 'webSearch') {
        const storeIsSearching =
          'isSearching' in storeConfig ? (storeConfig.isSearching as boolean) : false;
        const storeStatusMessage =
          'statusMessage' in storeConfig ? (storeConfig.statusMessage as string) : '';

        resolved.isSearching = effectiveConfig.config?.isSearching ?? storeIsSearching ?? false;
        resolved.statusMessage = effectiveConfig.config?.statusMessage ?? storeStatusMessage ?? '';
      }

      return resolved;
    },
    []
  );

  // Resolve each feature
  const resolvedWebSearchConfig = useMemo(
    () =>
      resolveFeature(
        'webSearch',
        features?.webSearch,
        webSearchFeatureToggle,
        useWebSearchFeatureToggle,
        webSearchConfig,
        storeWebSearchConfig as unknown as Record<string, unknown>
      ),
    [
      features?.webSearch,
      webSearchFeatureToggle,
      useWebSearchFeatureToggle,
      webSearchConfig,
      storeWebSearchConfig,
      resolveFeature,
    ]
  );

  const resolvedPrivacyModeConfig = useMemo(
    () =>
      resolveFeature(
        'privacyMode',
        features?.privacyMode,
        privacyModeToggle,
        usePrivacyModeToggle,
        privacyModeConfig,
        storePrivacyModeConfig as unknown as Record<string, unknown>
      ),
    [
      features?.privacyMode,
      privacyModeToggle,
      usePrivacyModeToggle,
      privacyModeConfig,
      storePrivacyModeConfig,
      resolveFeature,
    ]
  );

  const resolvedProModeConfig = useMemo(
    () =>
      resolveFeature(
        'proMode',
        features?.proMode,
        proModeToggle,
        useProModeToggle,
        proModeConfig,
        storeProModeConfig as unknown as Record<string, unknown>
      ),
    [
      features?.proMode,
      proModeToggle,
      useProModeToggle,
      proModeConfig,
      storeProModeConfig,
      resolveFeature,
    ]
  );

  const resolvedInteractiveModeConfig = useMemo(
    () =>
      resolveFeature(
        'interactiveMode',
        features?.interactiveMode,
        interactiveModeToggle,
        useInteractiveModeToggle,
        interactiveModeConfig,
        { isActive: false, enabled: false } // No store config for interactive mode
      ),
    [
      features?.interactiveMode,
      interactiveModeToggle,
      useInteractiveModeToggle,
      interactiveModeConfig,
      resolveFeature,
    ]
  );

  return {
    resolvedWebSearchConfig,
    resolvedPrivacyModeConfig,
    resolvedProModeConfig,
    resolvedInteractiveModeConfig,
  };
}
