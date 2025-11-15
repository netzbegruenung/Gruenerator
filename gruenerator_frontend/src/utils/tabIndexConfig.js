/**
 * Centralized TabIndex Configuration
 * 
 * This file manages all tabIndex values across the application to ensure:
 * - Header navigation comes first (0-5)
 * - Generator forms start after header (10+)
 * - Sequential, predictable tab navigation
 * - Easy maintenance and debugging
 */

// Global ranges - 100-gap system for maximum flexibility
export const TAB_INDEX_RANGES = {
  HEADER: { start: 0, end: 99 },           // Header navigation
  FORM_FIELDS: { start: 100, end: 399 },   // Main form inputs
  FEATURE_ICONS: { start: 400, end: 499 }, // Web search, privacy, attachments
  SELECTORS: { start: 500, end: 699 },     // Platform, knowledge, document selectors
  CONDITIONAL: { start: 700, end: 899 },   // Conditional/dynamic fields
  ACTIONS: { start: 900, end: 999 },       // Submit, cancel, other actions
  PROFILE: { start: 1000, end: 1999 },     // Profile page specific
  SPECIAL_PAGES: { start: 2000, end: 2999 } // Special pages/modals
};

// Page-specific tabIndex configurations
export const TAB_INDEX_CONFIG = {
  // Presse & Social Media Generator
  PRESS_SOCIAL: {
    // Form fields (100-399)
    thema: 100,
    details: 110,
    
    // Feature icons (400-499)
    webSearch: 400,
    privacyMode: 410,
    attachment: 420,
    
    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,
    
    // Conditional fields (700-899) - AnimatePresence
    sharepicType: 700,
    zitatAuthor: 710,
    zitatgeber: 720,
    pressekontakt: 730,
    
    // Actions (900-999)
    submit: 900
  },

  // Antrag Generator
  ANTRAG: {
    // Form fields (100-399)
    idee: 100,
    details: 110,
    gliederung: 120,
    
    // Feature icons (400-499)
    webSearch: 400,
    privacyMode: 410,
    attachment: 420,
    
    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,
    
    // Actions (900-999)
    submit: 900
  },

  // Grüne Jugend Generator
  GRUENE_JUGEND: {
    // Form fields (100-399)
    thema: 100,
    details: 110,
    
    // Feature icons (400-499)
    webSearch: 400,
    privacyMode: 410,
    attachment: 420,
    
    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,
    
    // Actions (900-999)
    submit: 900
  },

  // Universal Text Generator
  UNIVERSAL: {
    // Form fields (100-399)
    formType: 100,
    hauptfeld: 110,

    // Feature icons (400-499)
    webSearch: 400,
    privacyMode: 410,
    attachment: 420,

    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,

    // Actions (900-999)
    submit: 900
  },

  // Alt-Text Generator
  ALT_TEXT: {
    // Form fields (100-399)
    imageSource: 100,
    imageUpload: 110,
    imageDescription: 120,

    // Feature icons (400-499)
    privacyMode: 400,

    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,

    // Actions (900-999)
    submit: 900
  },

  // Leichte Sprache Generator
  LEICHTE_SPRACHE: {
    // Form fields (100-399)
    originalText: 100,
    targetLanguage: 110,

    // Feature icons (400-499)
    webSearch: 400,
    privacyMode: 410,
    attachment: 420,

    // Selectors (500-699)
    platformSelector: 500,
    knowledgeSourceSelector: 510,
    knowledgeSelector: 520,

    // Actions (900-999)
    submit: 900
  },

  // Profile Page - Main navigation
  PROFILE: {
    // Tab navigation buttons (1000-1099)
    profileTab: 1000,
    intelligenceTab: 1010,
    documentsTab: 1020,
    groupsTab: 1030,
    generatorsTab: 1040,
    laborTab: 1050,
    
    // Legacy aliases for backward compatibility
    tabsStart: 1000,
    contentStart: 1100
  },

  // Profile Page - ProfileInfoTab
  PROFILE_INFO: {
    // Profile form fields (1100-1199)
    avatarButton: 1100,
    emailInput: 1110,
    firstNameInput: 1120,
    lastNameInput: 1130,
    hedgehogToggle: 1140,
    
    // Actions (1200-1299)
    deleteAccountButton: 1200,
    
    // Conditional forms (1300-1399)
    deletePasswordInput: 1300,
    deleteConfirmButton: 1310,
    deleteCancelButton: 1320,
    
    // Modal elements (1400-1499)
    avatarOption: 1400, // Base for dynamic avatar options
    avatarModalClose: 1490
  },

  // Profile Page - GroupsManagementTab
  PROFILE_GROUPS: {
    // Navigation (1500-1599)
    overviewButton: 1500,
    createGroupButton: 1510,
    
    // Overview state (1600-1699)
    groupCard: 1600, // Base for dynamic group cards
    
    // Create group form (1700-1799)
    groupNameInput: 1700,
    createSubmitButton: 1710,
    createCancelButton: 1720,
    
    // Group detail view (1800-1899)
    groupDetailTabs: 1800,
    groupNameEdit: 1810,
    groupDescEdit: 1820,
    deleteGroupButton: 1830,
    copyLinkButton: 1840,
    
    // Group settings form (1900-1999)
    instructionTextarea: 1900,
    platformSelector: 1910,
    knowledgeSelector: 1920,
    addKnowledgeButton: 1930,
    removeKnowledgeButton: 1940,
    saveButton: 1950
  },

  // Profile Page - IntelligenceTab
  PROFILE_INTELLIGENCE: {
    // Vertical navigation (1100-1199)
    generalTab: 1100,
    pressTab: 1110,
    antragTab: 1120,
    jugendTab: 1130,
    memoryTab: 1140,
    
    // Instruction textareas (1200-1299)
    instructionTextarea: 1200, // Base for all instruction textareas
    
    // Knowledge management (1300-1399)
    addKnowledgeButton: 1300,
    removeKnowledgeButton: 1310,
    knowledgeSelector: 1320,
    
    // Memory section - conditional (1400-1499)
    memoryToggle: 1400,
    deleteAllMemoryButton: 1410,
    addMemoryButton: 1420,
    memoryInput: 1430,
    memoryTagInput: 1440,
    saveMemoryButton: 1450,
    cancelMemoryButton: 1460,
    deleteMemoryButton: 1470 // Base for individual memory delete buttons
  },

  // Profile Page - ContentManagementTab (merged DocumentsTab and CanvaTab)
  PROFILE_CONTENT_MANAGEMENT: {
    // Vertical navigation (1100-1199)
    documentsTab: 1100,
    qaTab: 1110,
    
    // Document overview (1200-1299)
    addContentButton: 1200,
    searchInput: 1210,
    filterSelect: 1220,
    documentCard: 1230, // Base for document cards
    editButton: 1240,
    deleteButton: 1250,
    shareButton: 1260,
    templateButton: 1270,
    
    // Q&A creator (1300-1399)
    qaQuestionInput: 1300,
    qaAnswerTextarea: 1310,
    qaSourceInput: 1320,
    qaSaveButton: 1330,
    qaCancelButton: 1340,
    
    // Modals - conditional (1400-1499)
    modalInput: 1400,
    modalButton: 1410,
    modalClose: 1420
  },

  // Profile Page - CustomGeneratorsTab
  PROFILE_GENERATORS: {
    // Navigation (1100-1199)
    overviewButton: 1100,
    createNewLink: 1110,
    generatorNavButton: 1120, // Base for dynamic generator nav buttons
    
    // Generator overview (1200-1299)
    generatorCard: 1200, // Base for generator cards
    openButton: 1210,
    deleteButton: 1220,
    
    // Generator detail (1300-1399)
    manageDocsButton: 1300,
    documentSelector: 1310,
    removeDocButton: 1320,
    backButton: 1330
  },

  // Profile Page - LaborTab
  PROFILE_LABOR: {
    // Feature toggles (1100-1199)
    featureToggle: 1100, // Base for all feature toggles
    
    // Feature links (1200-1299)
    featureLink: 1200 // Base for feature links when enabled
  },

  // Home Page
  HOME: {
    // Primary buttons (100-199)
    primaryButtons: 100,
    
    // Secondary buttons (200-299)
    secondaryButtons: 200,
    
    // Newsletter (300-399)
    newsletter: 300
  }
};

// Helper functions for working with tabIndex values
export const TabIndexHelpers = {
  /**
   * Get tabIndex by section and position (NEW - for 100-gap system)
   * @param {string} section - The section name (FORM, FEATURES, SELECTORS, etc.)
   * @param {number} position - Position within section (0-based, multiplied by 10)
   * @returns {number} Calculated tabIndex value
   */
  getBySection: (section, position = 0) => {
    const sectionStarts = {
      FORM: 100,
      FEATURES: 400,
      SELECTORS: 500,
      CONDITIONAL: 700,
      ACTIONS: 900,
      PROFILE: 1000,
      SPECIAL: 2000
    };
    
    if (!sectionStarts[section]) {
      console.warn(`Unknown section: ${section}`);
      return 100; // Default to form field range
    }
    
    return sectionStarts[section] + (position * 10);
  },

  /**
   * Check if tabIndex is in valid range (NEW - for 100-gap system)
   * @param {number} tabIndex - The tabIndex to check
   * @param {string} rangeName - The range name from TAB_INDEX_RANGES
   * @returns {boolean} Whether the index is in the specified range
   */
  isInRange: (tabIndex, rangeName) => {
    const range = TAB_INDEX_RANGES[rangeName];
    if (!range) {
      console.warn(`Unknown range: ${rangeName}`);
      return false;
    }
    return tabIndex >= range.start && tabIndex <= range.end;
  },

  /**
   * Get tabIndex for conditional elements (AnimatePresence, etc.)
   * @param {number} baseIndex - The base tabIndex value
   * @param {boolean} isVisible - Whether the element is currently visible
   * @returns {number|undefined} tabIndex value or undefined if not visible
   */
  getConditional: (baseIndex, isVisible) => isVisible ? baseIndex : undefined,

  /**
   * Get sequential tabIndex values starting from a base (UPDATED for 100-gap system)
   * @param {number} startIndex - Starting tabIndex value
   * @param {number} count - Number of sequential values needed
   * @returns {number[]} Array of sequential tabIndex values with 10-gaps
   */
  getSequential: (startIndex, count) => 
    Array.from({ length: count }, (_, i) => startIndex + (i * 10)),

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
      return 100; // Default to form field range instead of 1
    }
    return config[elementKey] + offset;
  },

  /**
   * Validate that tabIndex values don't conflict with reserved ranges (UPDATED)
   * @param {number} tabIndex - The tabIndex to validate
   * @returns {boolean} Whether the tabIndex is valid
   */
  isValidTabIndex: (tabIndex) => {
    // Check if it's in any of the defined ranges
    return Object.values(TAB_INDEX_RANGES).some(range => 
      tabIndex >= range.start && tabIndex <= range.end
    );
  }
};

// Export individual page configs for convenience
export const {
  PRESS_SOCIAL,
  ANTRAG,
  GRUENE_JUGEND,
  UNIVERSAL,
  ALT_TEXT,
  LEICHTE_SPRACHE,
  PROFILE,
  PROFILE_INFO,
  PROFILE_GROUPS,
  PROFILE_INTELLIGENCE,
  PROFILE_CONTENT_MANAGEMENT,
  PROFILE_GENERATORS,
  PROFILE_LABOR,
  HOME
} = TAB_INDEX_CONFIG;

// Default configuration for unknown pages
export const DEFAULT_TAB_INDEX = {
  // Form fields (100-399)
  form: 100,

  // Feature icons (400-499)
  webSearch: 400,
  privacyMode: 410,
  attachment: 420,

  // Selectors (500-699)
  platformSelector: 500,
  knowledgeSourceSelector: 510,
  knowledgeSelector: 520,

  // Actions (900-999)
  submit: 900
};