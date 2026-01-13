import React from 'react';
import type { PlatformOption, SubmitConfig } from '@/types/baseform';

interface FeatureIconsTabIndex {
  webSearch?: number;
  privacyMode?: number;
  attachment?: number;
}

interface ResolvedTabIndexes {
  featureIcons: FeatureIconsTabIndex;
  platformSelector: number;
  knowledgeSelector: number;
  knowledgeSourceSelector: number;
  documentSelector: number;
  submitButton: number;
}

interface ResolvedPlatformConfig {
  enabled: boolean;
  options: PlatformOption[];
  label: string | undefined;
  placeholder: string | undefined;
  helpText: string | undefined;
}

interface ResolvedUIConfig {
  enableKnowledgeSelector: boolean;
  showProfileSelector: boolean;
  showImageUpload: boolean;
  enableEditMode: boolean;
  useMarkdown: boolean | null;
}

interface ResolvedSubmitConfig {
  showButton: boolean | undefined;
  buttonText: string | undefined;
  buttonProps: Record<string, unknown> | undefined;
}

export interface UseFormConfigurationResult {
  resolvedTabIndexes: ResolvedTabIndexes;
  resolvedPlatformConfig: ResolvedPlatformConfig;
  resolvedUIConfig: ResolvedUIConfig;
  resolvedSubmitConfig: ResolvedSubmitConfig;
  effectiveSubmitButtonProps: Record<string, unknown>;
}

interface UseFormConfigurationParams {
  // Store configs
  storeTabIndexConfig: Record<string, unknown>;
  storePlatformConfig: Record<string, unknown>;
  storeSubmitConfig: Record<string, unknown>;
  storeUIConfig: Record<string, unknown>;

  // Prop overrides
  featureIconsTabIndex?: FeatureIconsTabIndex;
  platformSelectorTabIndex?: number;
  knowledgeSelectorTabIndex?: number;
  knowledgeSourceSelectorTabIndex?: number;
  documentSelectorTabIndex?: number;
  submitButtonTabIndex?: number;
  enablePlatformSelector?: boolean;
  platformOptions?: PlatformOption[];
  platformSelectorLabel?: string;
  platformSelectorPlaceholder?: string;
  platformSelectorHelpText?: string;
  enableKnowledgeSelector?: boolean;
  showProfileSelector?: boolean;
  showImageUpload?: boolean;
  enableEditMode?: boolean;
  useMarkdown?: boolean | null;
  submitConfig?: SubmitConfig | null;
  showNextButton?: boolean;
  nextButtonText?: string;
  submitButtonProps?: Record<string, unknown>;
  isEditModeActive?: boolean;
}

export function useFormConfiguration(params: UseFormConfigurationParams): UseFormConfigurationResult {
  const {
    storeTabIndexConfig,
    storePlatformConfig,
    storeSubmitConfig,
    storeUIConfig,
    featureIconsTabIndex,
    platformSelectorTabIndex,
    knowledgeSelectorTabIndex,
    knowledgeSourceSelectorTabIndex,
    documentSelectorTabIndex,
    submitButtonTabIndex,
    enablePlatformSelector,
    platformOptions,
    platformSelectorLabel,
    platformSelectorPlaceholder,
    platformSelectorHelpText,
    enableKnowledgeSelector,
    showProfileSelector,
    showImageUpload,
    enableEditMode,
    useMarkdown,
    submitConfig,
    showNextButton,
    nextButtonText,
    submitButtonProps,
    isEditModeActive
  } = params;

  const getConfigValue = React.useCallback(<T,>(
    storeConfig: Record<string, T | undefined>,
    propValue: T | undefined,
    key: string,
    defaultValue: T
  ): T => {
    return storeConfig[key] ?? propValue ?? defaultValue;
  }, []);

  const getTabIndexValue = React.useCallback(<T,>(
    key: string,
    propValue: T | undefined,
    defaultValue: T
  ): T => {
    return getConfigValue(storeTabIndexConfig as Record<string, T | undefined>, propValue, key, defaultValue);
  }, [storeTabIndexConfig, getConfigValue]);

  const resolvedTabIndexes = React.useMemo(() => ({
    featureIcons: getTabIndexValue('featureIcons', featureIconsTabIndex, {
      webSearch: 11,
      privacyMode: 12,
      attachment: 13
    }),
    platformSelector: getTabIndexValue('platformSelector', platformSelectorTabIndex, 12),
    knowledgeSelector: getTabIndexValue('knowledgeSelector', knowledgeSelectorTabIndex, 14),
    knowledgeSourceSelector: getTabIndexValue('knowledgeSourceSelector', knowledgeSourceSelectorTabIndex, 13),
    documentSelector: getTabIndexValue('documentSelector', documentSelectorTabIndex, 15),
    submitButton: getTabIndexValue('submitButton', submitButtonTabIndex, 17)
  }), [
    getTabIndexValue,
    featureIconsTabIndex,
    platformSelectorTabIndex,
    knowledgeSelectorTabIndex,
    knowledgeSourceSelectorTabIndex,
    documentSelectorTabIndex,
    submitButtonTabIndex
  ]);

  const resolvedPlatformConfig = React.useMemo((): ResolvedPlatformConfig => ({
    enabled: getConfigValue<boolean>(storePlatformConfig as Record<string, boolean | undefined>, enablePlatformSelector, 'enabled', false),
    options: getConfigValue<PlatformOption[]>(storePlatformConfig as Record<string, PlatformOption[] | undefined>, platformOptions, 'options', []),
    label: getConfigValue<string | undefined>(storePlatformConfig as Record<string, string | undefined>, platformSelectorLabel, 'label', undefined),
    placeholder: getConfigValue<string | undefined>(storePlatformConfig as Record<string, string | undefined>, platformSelectorPlaceholder, 'placeholder', undefined),
    helpText: getConfigValue<string | undefined>(storePlatformConfig as Record<string, string | undefined>, platformSelectorHelpText, 'helpText', undefined)
  }), [
    storePlatformConfig,
    getConfigValue,
    enablePlatformSelector,
    platformOptions,
    platformSelectorLabel,
    platformSelectorPlaceholder,
    platformSelectorHelpText
  ]);

  const resolvedUIConfig = React.useMemo((): ResolvedUIConfig => ({
    enableKnowledgeSelector: getConfigValue<boolean>(storeUIConfig as Record<string, boolean | undefined>, enableKnowledgeSelector, 'enableKnowledgeSelector', false),
    showProfileSelector: getConfigValue<boolean>(storeUIConfig as Record<string, boolean | undefined>, showProfileSelector, 'showProfileSelector', true),
    showImageUpload: getConfigValue<boolean>(storeUIConfig as Record<string, boolean | undefined>, showImageUpload, 'showImageUpload', false),
    enableEditMode: getConfigValue<boolean>(storeUIConfig as Record<string, boolean | undefined>, enableEditMode, 'enableEditMode', false),
    useMarkdown: getConfigValue<boolean | null>(storeUIConfig as Record<string, boolean | null | undefined>, useMarkdown, 'useMarkdown', null)
  }), [
    storeUIConfig,
    getConfigValue,
    enableKnowledgeSelector,
    showProfileSelector,
    showImageUpload,
    enableEditMode,
    useMarkdown
  ]);

  const resolvedSubmitConfig = React.useMemo((): ResolvedSubmitConfig => {
    const storeShowButton = getConfigValue<boolean | null>(storeSubmitConfig as Record<string, boolean | null | undefined>, null, 'showButton', null);
    const storeButtonText = getConfigValue<string | null>(storeSubmitConfig as Record<string, string | null | undefined>, null, 'buttonText', null);
    const storeButtonProps = getConfigValue<Record<string, unknown> | null>(storeSubmitConfig as Record<string, Record<string, unknown> | null | undefined>, null, 'buttonProps', null);

    if (submitConfig) {
      return {
        showButton: submitConfig.showButton ?? storeShowButton ?? showNextButton,
        buttonText: submitConfig.buttonText ?? storeButtonText ?? nextButtonText,
        buttonProps: submitConfig.buttonProps ?? storeButtonProps ?? submitButtonProps
      };
    }
    return {
      showButton: storeShowButton ?? showNextButton,
      buttonText: storeButtonText ?? nextButtonText,
      buttonProps: storeButtonProps ?? submitButtonProps
    };
  }, [submitConfig, showNextButton, nextButtonText, submitButtonProps, storeSubmitConfig, getConfigValue]);

  const effectiveSubmitButtonProps = React.useMemo(() => {
    const base = (resolvedSubmitConfig.buttonProps || {}) as Record<string, unknown>;
    if (isEditModeActive) {
      return { ...base, defaultText: (base.defaultText as string) || 'Verbessern' };
    }
    return base;
  }, [resolvedSubmitConfig.buttonProps, isEditModeActive]);

  return {
    resolvedTabIndexes,
    resolvedPlatformConfig,
    resolvedUIConfig,
    resolvedSubmitConfig,
    effectiveSubmitButtonProps
  };
}
