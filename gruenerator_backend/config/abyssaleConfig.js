/**
 * Abyssale Design Configuration
 *
 * Maps sharepic types to Abyssale design template IDs.
 * Design IDs can be found in the Abyssale dashboard.
 */

module.exports = {
  designIds: {
    zitat: process.env.ABYSSALE_ZITAT_DESIGN_ID || 'fc939548-a4e4-426c-be66-66034d612542',
    // Add more design IDs as needed:
    // zitat_pure: process.env.ABYSSALE_ZITAT_PURE_DESIGN_ID || '',
    // headline: process.env.ABYSSALE_HEADLINE_DESIGN_ID || '',
    // info: process.env.ABYSSALE_INFO_DESIGN_ID || '',
    // dreizeilen: process.env.ABYSSALE_DREIZEILEN_DESIGN_ID || '',
  },

  /**
   * Get design ID for a specific sharepic type
   * @param {string} type - Sharepic type (zitat, headline, info, etc.)
   * @returns {string|null} Design ID or null if not configured
   */
  getDesignId(type) {
    return this.designIds[type] || null;
  },

  /**
   * Element mapping configurations for different design types.
   * Maps our data fields to Abyssale element names.
   */
  elementMappings: {
    zitat: {
      quote: 'text_0',
      name: 'text_1'
    }
    // Add more mappings as needed
  }
};
