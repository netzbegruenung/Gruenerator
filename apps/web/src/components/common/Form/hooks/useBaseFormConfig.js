import React from 'react';

import { useFormStateSelector } from '../FormStateProvider';

/**
 * Helper hook to manage BaseForm configuration via the store
 * This reduces props drilling by allowing components to store configuration
 * in the FormStateProvider instead of passing them as props
 *
 * @param {Object} config - Configuration object
 * @param {Object} config.tabIndex - Tab index mappings
 * @param {Object} config.platform - Platform selector configuration
 * @param {Object} config.submit - Submit button configuration
 * @param {Object} config.ui - UI behavior configuration
 * @param {Object} config.help - Help content configuration
 * @returns {Object} - Simplified props for BaseForm
 */
const useBaseFormConfig = (config = {}) => {
  // Get store actions
  const updateTabIndexConfig = useFormStateSelector((state) => state.updateTabIndexConfig);
  const updatePlatformConfig = useFormStateSelector((state) => state.updatePlatformConfig);
  const updateSubmitConfig = useFormStateSelector((state) => state.updateSubmitConfig);
  const updateUIConfig = useFormStateSelector((state) => state.updateUIConfig);
  const updateHelpConfig = useFormStateSelector((state) => state.updateHelpConfig);

  // Initialize store with configuration
  React.useEffect(() => {
    if (config.tabIndex) {
      updateTabIndexConfig(config.tabIndex);
    }
    if (config.platform) {
      updatePlatformConfig(config.platform);
    }
    if (config.submit) {
      updateSubmitConfig(config.submit);
    }
    if (config.ui) {
      updateUIConfig(config.ui);
    }
    if (config.help) {
      updateHelpConfig(config.help);
    }
  }, [
    config.tabIndex,
    config.platform,
    config.submit,
    config.ui,
    config.help,
    updateTabIndexConfig,
    updatePlatformConfig,
    updateSubmitConfig,
    updateUIConfig,
    updateHelpConfig,
  ]);

  // Return simplified props for BaseForm
  // Note: Most props are now handled by the store,
  // so BaseForm only needs the essential ones
  return {
    // Essential props that should still be passed
    title: config.title,
    onSubmit: config.onSubmit,
    children: config.children,
    componentName: config.componentName,

    // Dynamic state that can't be pre-configured
    loading: config.loading,
    success: config.success,
    error: config.error,
    generatedContent: config.generatedContent,

    // Callback functions
    onGeneratePost: config.onGeneratePost,
    onSave: config.onSave,
    onFormChange: config.onFormChange,
    onImageChange: config.onImageChange,

    // Content that may change
    formNotice: config.formNotice,
    displayActions: config.displayActions,
    headerContent: config.headerContent,
    bottomSectionChildren: config.bottomSectionChildren,
    firstExtrasChildren: config.firstExtrasChildren,
  };
};

export default useBaseFormConfig;
