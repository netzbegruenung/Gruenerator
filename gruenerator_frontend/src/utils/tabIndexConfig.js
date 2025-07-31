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
    sharepicType: 15,
    zitatAuthor: 16,
    zitatgeber: 17,
    pressekontakt: 18,
    submit: 19
  },

  // Antrag Generator
  ANTRAG: {
    idee: 10,
    details: 11,
    platformSelector: 12,
    gliederung: 13,
    knowledgeSourceSelector: 14,
    knowledgeSelector: 15,
    webSearch: 16,
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

  // Profile Page - Main navigation
  PROFILE: {
    tabsStart: 10,
    contentStart: 15,
    // Tab navigation buttons
    profileTab: 10,
    intelligenceTab: 11,
    documentsTab: 12,
    groupsTab: 13,
    generatorsTab: 14,
    laborTab: 15
  },

  // Profile Page - ProfileInfoTab
  PROFILE_INFO: {
    avatarButton: 20,
    emailInput: 21,
    firstNameInput: 22,
    lastNameInput: 23,
    hedgehogToggle: 24,
    deleteAccountButton: 25,
    // Delete account form (conditional)
    deletePasswordInput: 26,
    deleteConfirmButton: 27,
    deleteCancelButton: 28,
    // Avatar modal (conditional)
    avatarOption: 30, // Base for dynamic avatar options
    avatarModalClose: 40
  },

  // Profile Page - GroupsManagementTab
  PROFILE_GROUPS: {
    // Navigation
    overviewButton: 20,
    createGroupButton: 21,
    // Overview state
    groupCard: 25, // Base for dynamic group cards
    // Create group form
    groupNameInput: 30,
    createSubmitButton: 31,
    createCancelButton: 32,
    // Group detail view
    groupDetailTabs: 35,
    groupNameEdit: 36,
    groupDescEdit: 37,
    deleteGroupButton: 38,
    copyLinkButton: 39,
    // Group settings form
    instructionTextarea: 40,
    platformSelector: 41,
    knowledgeSelector: 42,
    addKnowledgeButton: 43,
    removeKnowledgeButton: 44,
    saveButton: 45
  },

  // Profile Page - IntelligenceTab
  PROFILE_INTELLIGENCE: {
    // Vertical navigation
    generalTab: 20,
    pressTab: 21,
    antragTab: 22,
    jugendTab: 23,
    memoryTab: 24,
    // Instruction textareas
    instructionTextarea: 30, // Base for all instruction textareas
    // Knowledge management
    addKnowledgeButton: 35,
    removeKnowledgeButton: 36,
    knowledgeSelector: 37,
    // Memory section (conditional)
    memoryToggle: 40,
    deleteAllMemoryButton: 41,
    addMemoryButton: 42,
    memoryInput: 43,
    memoryTagInput: 44,
    saveMemoryButton: 45,
    cancelMemoryButton: 46,
    deleteMemoryButton: 47 // Base for individual memory delete buttons
  },

  // Profile Page - DocumentsTab
  PROFILE_DOCUMENTS: {
    // Vertical navigation
    documentsTab: 20,
    qaTab: 21,
    // Document overview
    addContentButton: 25,
    searchInput: 26,
    filterSelect: 27,
    documentCard: 30, // Base for document cards
    editButton: 31,
    deleteButton: 32,
    shareButton: 33,
    templateButton: 34,
    // Q&A creator
    qaQuestionInput: 40,
    qaAnswerTextarea: 41,
    qaSourceInput: 42,
    qaSaveButton: 43,
    qaCancelButton: 44,
    // Modals (conditional)
    modalInput: 50,
    modalButton: 51,
    modalClose: 52
  },

  // Profile Page - CustomGeneratorsTab
  PROFILE_GENERATORS: {
    // Navigation
    overviewButton: 20,
    createNewLink: 21,
    generatorNavButton: 25, // Base for dynamic generator nav buttons
    // Generator overview
    generatorCard: 30, // Base for generator cards
    openButton: 31,
    deleteButton: 32,
    // Generator detail
    manageDocsButton: 35,
    documentSelector: 36,
    removeDocButton: 37,
    backButton: 38
  },

  // Profile Page - LaborTab
  PROFILE_LABOR: {
    featureToggle: 20, // Base for all feature toggles
    featureLink: 30 // Base for feature links when enabled
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
  PROFILE_INFO,
  PROFILE_GROUPS,
  PROFILE_INTELLIGENCE,
  PROFILE_DOCUMENTS,
  PROFILE_GENERATORS,
  PROFILE_LABOR,
  HOME
} = TAB_INDEX_CONFIG;

// Default configuration for unknown pages
export const DEFAULT_TAB_INDEX = {
  form: 10,
  submit: 17
};