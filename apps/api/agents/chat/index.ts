/**
 * Chat Agents Barrel Export
 * Provides backward-compatible exports for all chat agent functionality
 */

// Intent Classification
export {
  classifyIntent,
  classifyWithAI,
  getAvailableAgents,
  AGENT_MAPPINGS,
  findKeywordMatch,
  classifyFromContext,
  isQuestionMessage,
} from './IntentClassifier.js';

// Information Request Handler
export {
  handleInformationRequest,
  checkForMissingInformation,
  generateInformationQuestion,
  extractRequestedInformation,
  completePendingRequest,
  createInformationRequest,
  generateAntragQuestions,
  analyzeAnswersForFollowup,
  generateFollowUpQuestions,
  extractStructuredAnswers,
  isWebSearchConfirmation,
  getWebSearchQuestion,
} from './InformationRequestHandler.js';

// Information Request Handler Types
export type {
  FieldConfig,
  RequiredFieldsConfig,
  MissingFieldInfo,
  InformationRequestResponse,
  PendingRequest,
  RequestContext,
  ClassifiedIntent,
  StructuredAnswers,
  QuestionConfig,
  HandlerResult,
} from './InformationRequestHandler.js';

// Parameter Extraction
export {
  extractParameters,
  analyzeParameterConfidence,
  extractQuoteAuthor,
  extractTheme,
  extractDetails,
  extractPlatforms,
  extractTextForm,
  extractStyle,
  extractStructure,
  determineRequestType,
  extractLines,
  detectImagineMode,
  extractImagineSubject,
  extractImagineVariant,
  extractImagineTitle,
  extractEditAction,
} from './ParameterExtractor/index.js';

// Parameter Extraction Types
export type {
  BaseParameters,
  ExtractedParameters,
  SocialMediaParameters,
  GrueneJugendParameters,
  AntragParameters,
  SharepicParameters,
  ZitatParameters,
  DreiZeilenParameters,
  ImagineParameters,
  UniversalParameters,
  LeichteSpracheParameters,
  AuthorExtractionResult,
  VariantResult,
  LinesExtractionResult,
  ConfidenceAnalysis,
} from './ParameterExtractor/index.js';

// Core Type exports
export type {
  AgentMapping,
  AgentMappings,
  Intent,
  ClassificationResult,
  ChatContext,
  AIWorkerPool,
  AIWorkerRequest,
  AIWorkerResponse,
  AIClassificationResponse,
  KeywordMatch,
  ContextClassification,
} from './types.js';
