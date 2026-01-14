/**
 * useTabIndex Hook
 * 
 * Provides centralized tabIndex management for forms and components.
 * Ensures consistent tab navigation across the application.
 */

import { useMemo } from 'react';
import { TAB_INDEX_CONFIG, TabIndexHelpers, DEFAULT_TAB_INDEX } from '../utils/tabIndexConfig';

type PageType = keyof typeof TAB_INDEX_CONFIG;
type TabIndexConfig = Record<string, number>;

/**
 * Custom hook for managing tabIndex values
 * @param {string} pageType - The page type key from TAB_INDEX_CONFIG
 * @returns {object} Object with tabIndex values and helper functions
 */
export const useTabIndex = (pageType: PageType | string | undefined) => {
  const config = useMemo(() => {
    if (!pageType) {
      return DEFAULT_TAB_INDEX;
    }

    const isValidPageType = pageType in TAB_INDEX_CONFIG;
    if (!isValidPageType) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`useTabIndex: Unknown pageType "${pageType}", using default config`);
      }
      return DEFAULT_TAB_INDEX;
    }

    return TAB_INDEX_CONFIG[pageType as PageType];
  }, [pageType]);

  // Helper functions bound to the current page config
  const helpers = useMemo(() => ({
    /**
     * Get tabIndex for conditional elements
     * @param {string} elementKey - Key from the page config
     * @param {boolean} isVisible - Whether element is visible
     * @returns {number|undefined}
     */
    getConditional: (elementKey: string, isVisible: boolean) => {
      const baseIndex = config[elementKey];
      return TabIndexHelpers.getConditional(baseIndex, isVisible);
    },

    /**
     * Get tabIndex with offset
     * @param {string} elementKey - Key from the page config  
     * @param {number} offset - Offset to add
     * @returns {number}
     */
    getWithOffset: (elementKey: string, offset = 0) => {
      if (!pageType || !(pageType in TAB_INDEX_CONFIG)) {
        return (DEFAULT_TAB_INDEX[elementKey as keyof typeof DEFAULT_TAB_INDEX] ?? 100) + offset;
      }
      return TabIndexHelpers.getWithOffset(pageType as PageType, elementKey, offset);
    },

    /**
     * Get raw tabIndex value for an element
     * @param {string} elementKey - Key from the page config
     * @returns {number}
     */
    get: (elementKey: string) => {
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
export const useFormTabIndex = (pageType: PageType | string | undefined, elementKeys: string[]) => {
  const tabIndex = useTabIndex(pageType);

  const formConfig = useMemo(() => {
    const result: TabIndexConfig = {};
    elementKeys.forEach((key: string) => {
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
export const useBaseFormTabIndex = (pageType: PageType | string | undefined) => {
  const tabIndex = useTabIndex(pageType);

  return useMemo(() => ({
    platformSelector: tabIndex.get('platformSelector') || 12,
    knowledgeSourceSelector: tabIndex.get('knowledgeSourceSelector') || 13,
    knowledgeSelector: tabIndex.get('knowledgeSelector') || 14,
    submit: tabIndex.get('submit') || 19,
    
    // For passing to child components
    platformSelectorTabIndex: tabIndex.get('platformSelector') || 12,
    knowledgeSourceSelectorTabIndex: tabIndex.get('knowledgeSourceSelector') || 13,
    knowledgeSelectorTabIndex: tabIndex.get('knowledgeSelector') || 14,
    submitButtonTabIndex: tabIndex.get('submit') || 19
  }), [tabIndex]);
};

export default useTabIndex;