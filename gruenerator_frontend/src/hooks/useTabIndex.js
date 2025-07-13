/**
 * useTabIndex Hook
 * 
 * Provides centralized tabIndex management for forms and components.
 * Ensures consistent tab navigation across the application.
 */

import { useMemo } from 'react';
import { TAB_INDEX_CONFIG, TabIndexHelpers, DEFAULT_TAB_INDEX } from '../utils/tabIndexConfig';

/**
 * Custom hook for managing tabIndex values
 * @param {string} pageType - The page type key from TAB_INDEX_CONFIG
 * @returns {object} Object with tabIndex values and helper functions
 */
export const useTabIndex = (pageType) => {
  const config = useMemo(() => {
    if (!pageType) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('useTabIndex: No pageType provided, using default config');
      }
      return DEFAULT_TAB_INDEX;
    }

    const pageConfig = TAB_INDEX_CONFIG[pageType];
    if (!pageConfig) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`useTabIndex: Unknown pageType "${pageType}", using default config`);
      }
      return DEFAULT_TAB_INDEX;
    }

    return pageConfig;
  }, [pageType]);

  // Helper functions bound to the current page config
  const helpers = useMemo(() => ({
    /**
     * Get tabIndex for conditional elements
     * @param {string} elementKey - Key from the page config
     * @param {boolean} isVisible - Whether element is visible
     * @returns {number|undefined}
     */
    getConditional: (elementKey, isVisible) => {
      const baseIndex = config[elementKey];
      return TabIndexHelpers.getConditional(baseIndex, isVisible);
    },

    /**
     * Get tabIndex with offset
     * @param {string} elementKey - Key from the page config  
     * @param {number} offset - Offset to add
     * @returns {number}
     */
    getWithOffset: (elementKey, offset = 0) => {
      return TabIndexHelpers.getWithOffset(pageType, elementKey, offset);
    },

    /**
     * Get raw tabIndex value for an element
     * @param {string} elementKey - Key from the page config
     * @returns {number}
     */
    get: (elementKey) => {
      const value = config[elementKey];
      if (value === undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`useTabIndex: Element key "${elementKey}" not found in ${pageType} config`);
        }
        return 1; // Fallback
      }
      return value;
    },

    /**
     * Check if tabIndex is valid
     * @param {number} tabIndex
     * @returns {boolean}
     */
    isValid: TabIndexHelpers.isValidTabIndex
  }), [config, pageType]);

  return {
    // Direct access to config values
    ...config,
    
    // Helper functions
    ...helpers,

    // Raw config for advanced usage
    config,
    
    // Page type for debugging
    pageType
  };
};

/**
 * Specialized hook for form components that need sequential tabIndex values
 * @param {string} pageType - The page type key
 * @param {string[]} elementKeys - Array of element keys in order
 * @returns {object} Object with tabIndex values for each element
 */
export const useFormTabIndex = (pageType, elementKeys) => {
  const tabIndex = useTabIndex(pageType);

  const formConfig = useMemo(() => {
    const result = {};
    elementKeys.forEach(key => {
      result[key] = tabIndex.get(key);
    });
    return result;
  }, [tabIndex, elementKeys]);

  return {
    ...formConfig,
    helpers: {
      getConditional: tabIndex.getConditional,
      get: tabIndex.get
    }
  };
};

/**
 * Hook for BaseForm components to get standard form element tabIndex values
 * @param {string} pageType - The page type key
 * @returns {object} Standard form element tabIndex values
 */
export const useBaseFormTabIndex = (pageType) => {
  const tabIndex = useTabIndex(pageType);

  return useMemo(() => ({
    platformSelector: tabIndex.get('platformSelector') || 12,
    knowledgeSourceSelector: tabIndex.get('knowledgeSourceSelector') || 13,
    knowledgeSelector: tabIndex.get('knowledgeSelector') || 14,
    submit: tabIndex.get('submit') || 17,
    
    // For passing to child components
    platformSelectorTabIndex: tabIndex.get('platformSelector') || 12,
    knowledgeSourceSelectorTabIndex: tabIndex.get('knowledgeSourceSelector') || 13,
    knowledgeSelectorTabIndex: tabIndex.get('knowledgeSelector') || 14,
    submitButtonTabIndex: tabIndex.get('submit') || 17
  }), [tabIndex]);
};

export default useTabIndex;