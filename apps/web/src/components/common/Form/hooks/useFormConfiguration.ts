import React from 'react';
import type { PlatformOption } from '@/types/baseform';

interface UseFormConfigurationParams {
  // Store configs
  storeTabIndexConfig: Record<string, unknown>;
  storePlatformConfig: Record<string, unknown>;
  storeSubmitConfig: Record<string, unknown>;
  storeUIConfig: Record<string, unknown>;

  // Prop overrides
  featureIconsTabIndex?: { webSearch?: number; privacyMode?: number; attachment?: number };
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
  submitConfig?: Record<string, unknown>;
  showNextButton?: boolean;
  nextButtonText?: string;
  submitButtonProps?: Record<string, unknown>;
  isEditModeActive?: boolean;
}

export function useFormConfiguration(params: UseFormConfigurationParams) {
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

  const resolvedPlatformConfig = React.useMemo(() => ({
    enabled: getConfigValue(storePlatformConfig, enablePlatformSelector, 'enabled', false),
    options: getConfigValue(storePlatformConfig, platformOptions, 'options', []),
    label: getConfigValue(storePlatformConfig, platformSelectorLabel, 'label', undefined),
    placeholder: getConfigValue(storePlatformConfig, platformSelectorPlaceholder, 'placeholder', undefined),
    helpText: getConfigValue(storePlatformConfig, platformSelectorHelpText, 'helpText', undefined)
  }), [
    storePlatformConfig,
    getConfigValue,
    enablePlatformSelector,
    platformOptions,
    platformSelectorLabel,
    platformSelectorPlaceholder,
    platformSelectorHelpText
  ]);

  const resolvedUIConfig = React.useMemo(() => ({
    enableKnowledgeSelector: getConfigValue(storeUIConfig, enableKnowledgeSelector, 'enableKnowledgeSelector', false),
    showProfileSelector: getConfigValue(storeUIConfig, showProfileSelector, 'showProfileSelector', true),
    showImageUpload: getConfigValue(storeUIConfig, showImageUpload, 'showImageUpload', false),
    enableEditMode: getConfigValue(storeUIConfig, enableEditMode, 'enableEditMode', false),
    useMarkdown: getConfigValue(storeUIConfig, useMarkdown, 'useMarkdown', null)
  }), [
    storeUIConfig,
    getConfigValue,
    enableKnowledgeSelector,
    showProfileSelector,
    showImageUpload,
    enableEditMode,
    useMarkdown
  ]);

  const resolvedSubmitConfig = React.useMemo(() => {
    const storeShowButton = getConfigValue(storeSubmitConfig, null, 'showButton', null);
    const storeButtonText = getConfigValue(storeSubmitConfig, null, 'buttonText', null);
    const storeButtonProps = getConfigValue(storeSubmitConfig, null, 'buttonProps', null);

    if (submitConfig) {
      return {
        showButton: submitConfig.showButton ?? storeShowButton ?? showNextButton,
        buttonText: submitConfig.buttonText ?? storeButtonText ?? nextButtonText,
        buttonProps: submitConfig.buttonProps ?? storeButtonProps ?? submitButtonProps,
        ...submitConfig
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
