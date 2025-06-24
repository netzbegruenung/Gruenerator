/**
 * Centralized TabIndex Configuration
 * 
 * This file manages all tabIndex values across the application to ensure:
 * - Header navigation comes first (0-5)
 * - Generator forms start after header (10+)
 * - Sequential, predictable tab navigation
 * - Easy maintenance and debugging
 */

// Global ranges
export const TAB_INDEX_RANGES = {
  HEADER: { start: 0, end: 5 },
  GENERATORS: { start: 10, end: 30 },
  PROFILE: { start: 10, end: 20 },
  SPECIAL_PAGES: { start: 10, end: 15 }
};

// Page-specific tabIndex configurations
export const TAB_INDEX_CONFIG = {
  // Presse & Social Media Generator
  PRESS_SOCIAL: {
    thema: 10,
    details: 11,
    platformSelector: 12,
    knowledgeSourceSelector: 13,
    knowledgeSelector: 14,
    // Conditional fields (AnimatePresence)
    zitatgeber: 15,
    pressekontakt: 16,
    submit: 17
  },

  // Antrag Generator
  ANTRAG: {
    idee: 10,
    details: 11,
    gliederung: 12,
    knowledgeSourceSelector: 13,
    knowledgeSelector: 14,
    webSearch: 15,
    submit: 17
  },

  // Grüne Jugend Generator
  GRUENE_JUGEND: {
    thema: 10,
    details: 11,
    platformSelector: 12,
    knowledgeSourceSelector: 13,
    knowledgeSelector: 14,
    submit: 17
  },

  // Universal Text Generator
  UNIVERSAL: {
    formType: 10,
    hauptfeld: 11,
    knowledgeSourceSelector: 12,
    knowledgeSelector: 13,
    submit: 15
  },

  // Profile Page
  PROFILE: {
    tabsStart: 10,
    contentStart: 15
  },

  // Home Page
  HOME: {
    primaryButtons: 10,
    secondaryButtons: 15,
    newsletter: 20
  }
};

// Helper functions for working with tabIndex values
export const TabIndexHelpers = {
  /**
   * Get tabIndex for conditional elements (AnimatePresence, etc.)
   * @param {number} baseIndex - The base tabIndex value
   * @param {boolean} isVisible - Whether the element is currently visible
   * @returns {number|undefined} tabIndex value or undefined if not visible
   */
  getConditional: (baseIndex, isVisible) => isVisible ? baseIndex : undefined,

  /**
   * Get sequential tabIndex values starting from a base
   * @param {number} startIndex - Starting tabIndex value
   * @param {number} count - Number of sequential values needed
   * @returns {number[]} Array of sequential tabIndex values
   */
  getSequential: (startIndex, count) => 
    Array.from({ length: count }, (_, i) => startIndex + i),

  /**
   * Get tabIndex for form elements with offset
   * @param {string} pageType - The page type key from TAB_INDEX_CONFIG
   * @param {string} elementKey - The element key within the page config
   * @param {number} offset - Optional offset to add
   * @returns {number} Calculated tabIndex value
   */
  getWithOffset: (pageType, elementKey, offset = 0) => {
    const config = TAB_INDEX_CONFIG[pageType];
    if (!config || !config[elementKey]) {
      console.warn(`TabIndex not found for ${pageType}.${elementKey}`);
      return 1; // Fallback
    }
    return config[elementKey] + offset;
  },

  /**
   * Validate that tabIndex values don't conflict with reserved ranges
   * @param {number} tabIndex - The tabIndex to validate
   * @returns {boolean} Whether the tabIndex is valid
   */
  isValidTabIndex: (tabIndex) => {
    // Ensure we don't conflict with header range
    const headerEnd = TAB_INDEX_RANGES.HEADER.end;
    const generatorStart = TAB_INDEX_RANGES.GENERATORS.start;
    
    return tabIndex <= headerEnd || tabIndex >= generatorStart;
  }
};

// Export individual page configs for convenience
export const {
  PRESS_SOCIAL,
  ANTRAG,
  GRUENE_JUGEND,
  UNIVERSAL,
  PROFILE,
  HOME
} = TAB_INDEX_CONFIG;

// Default configuration for unknown pages
export const DEFAULT_TAB_INDEX = {
  form: 10,
  submit: 17
};