export * from './types.js';

export {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  COMPREHENSIVE_DOSSIER_INSTRUCTIONS,
  SEARCH_DOCUMENTS_TOOL,
  TITLE_GENERATION_INSTRUCTION
} from './constants.js';

export {
  extractCitationsFromText,
  processAIResponseWithCitations
} from './citations.js';

export { detectContentType } from './contentType.js';

export {
  generateSmartTitle,
  extractTitleFromResponse
} from './titleUtils.js';

export {
  sanitizeMarkdownForDisplay,
  processResponseWithTitle
} from './responseProcessor.js';
