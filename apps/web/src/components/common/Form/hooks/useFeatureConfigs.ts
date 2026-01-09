import React from 'react';
import type { FeatureToggle } from '@/types/baseform';

interface WebSearchConfig {
  isActive: boolean;
  isSearching: boolean;
  statusMessage: string;
  enabled: boolean;
}

interface PrivacyModeConfig {
  isActive: boolean;
  enabled: boolean;
}

interface ProModeConfig {
  isActive: boolean;
  enabled: boolean;
}

interface UseFeatureConfigsParams {
  // Web Search
  webSearchFeatureToggle?: FeatureToggle | null;
  useWebSearchFeatureToggle?: boolean;
  webSearchConfig?: { isActive?: boolean; isSearching?: boolean; statusMessage?: string } | null;
  storeWebSearchConfig: WebSearchConfig;

  // Privacy Mode
  privacyModeToggle?: FeatureToggle | null;
  usePrivacyModeToggle?: boolean;
  privacyModeConfig?: { isActive?: boolean } | null;
  storePrivacyModeConfig: PrivacyModeConfig;

  // Pro Mode
  proModeToggle?: FeatureToggle | null;
  useProModeToggle?: boolean;
  proModeConfig?: { isActive?: boolean } | null;
  storeProModeConfig: ProModeConfig;

  // Interactive Mode
  interactiveModeToggle?: FeatureToggle | null;
  useInteractiveModeToggle?: boolean;
  interactiveModeConfig?: { isActive?: boolean } | null;
}

export function useFeatureConfigs(params: UseFeatureConfigsParams) {
  const {
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
    interactiveModeConfig
  } = params;

  const resolvedWebSearchConfig = React.useMemo(() => ({
    enabled: storeWebSearchConfig.enabled || useWebSearchFeatureToggle || false,
    toggle: webSearchFeatureToggle,
    isActive: webSearchConfig?.isActive ?? storeWebSearchConfig.isActive,
    isSearching: webSearchConfig?.isSearching ?? storeWebSearchConfig.isSearching,
    statusMessage: webSearchConfig?.statusMessage ?? storeWebSearchConfig.statusMessage
  }), [webSearchConfig, useWebSearchFeatureToggle, webSearchFeatureToggle, storeWebSearchConfig]);

  const resolvedPrivacyModeConfig = React.useMemo(() => ({
    enabled: storePrivacyModeConfig.enabled || usePrivacyModeToggle || false,
    toggle: privacyModeToggle,
    isActive: privacyModeConfig?.isActive ?? storePrivacyModeConfig.isActive
  }), [privacyModeConfig, usePrivacyModeToggle, privacyModeToggle, storePrivacyModeConfig]);

  const resolvedProModeConfig = React.useMemo(() => ({
    enabled: storeProModeConfig.enabled || useProModeToggle || false,
    toggle: proModeToggle,
    isActive: proModeConfig?.isActive ?? storeProModeConfig.isActive
  }), [proModeConfig, useProModeToggle, proModeToggle, storeProModeConfig]);

  const resolvedInteractiveModeConfig = React.useMemo(() => ({
    enabled: useInteractiveModeToggle || false,
    toggle: interactiveModeToggle,
    isActive: interactiveModeConfig?.isActive ?? false
  }), [interactiveModeConfig, useInteractiveModeToggle, interactiveModeToggle]);

  return {
    resolvedWebSearchConfig,
    resolvedPrivacyModeConfig,
    resolvedProModeConfig,
    resolvedInteractiveModeConfig
  };
}
