/**
 * Text2Sharepic Service - Main Export
 *
 * AI-powered text-to-sharepic generation service.
 * Converts user descriptions into professional sharepics using
 * corporate design, component library, and zone templates.
 */

const { SharepicComposer, createSharepicComposer, quickGenerate } = require('./sharepicComposer');
const componentLibrary = require('./componentLibrary');
const zoneTemplates = require('./zoneTemplates');
const aiLayoutGenerator = require('./aiLayoutGenerator');
const layoutValidator = require('./layoutValidator');

module.exports = {
  // Main service
  SharepicComposer,
  createSharepicComposer,
  quickGenerate,

  // Component library
  componentLibrary: {
    registerComponent: componentLibrary.registerComponent,
    getComponent: componentLibrary.getComponent,
    listComponents: componentLibrary.listComponents,
    renderComponent: componentLibrary.renderComponent,
    getCorporateDesign: componentLibrary.getCorporateDesign,
    CORPORATE_DESIGN: componentLibrary.CORPORATE_DESIGN
  },

  // Zone templates
  zoneTemplates: {
    registerTemplate: zoneTemplates.registerTemplate,
    getTemplate: zoneTemplates.getTemplate,
    listTemplates: zoneTemplates.listTemplates,
    getTemplatesByCategory: zoneTemplates.getTemplatesByCategory,
    getTemplatesForContentType: zoneTemplates.getTemplatesForContentType,
    validateComponentPlacement: zoneTemplates.validateComponentPlacement,
    getZoneBounds: zoneTemplates.getZoneBounds,
    getTemplateZonesWithBounds: zoneTemplates.getTemplateZonesWithBounds,
    CANVAS_DIMENSIONS: zoneTemplates.CANVAS_DIMENSIONS
  },

  // AI Layout Generator
  aiLayoutGenerator: {
    buildSystemPrompt: aiLayoutGenerator.buildSystemPrompt,
    buildUserMessage: aiLayoutGenerator.buildUserMessage,
    generateLayout: aiLayoutGenerator.generateLayout,
    generateLayoutWithRetry: aiLayoutGenerator.generateLayoutWithRetry,
    parseResponse: aiLayoutGenerator.parseResponse
  },

  // Layout Validator
  layoutValidator: {
    validateLayout: layoutValidator.validateLayout,
    validateAIOutput: layoutValidator.validateAIOutput,
    validateZone: layoutValidator.validateZone,
    validateParams: layoutValidator.validateParams,
    validateGeneratedText: layoutValidator.validateGeneratedText,
    isAllowedColor: layoutValidator.isAllowedColor,
    isValidImagePath: layoutValidator.isValidImagePath,
    CONSTRAINTS: layoutValidator.CONSTRAINTS
  }
};
