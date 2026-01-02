/**
 * Type definitions for PromptProcessor
 * Core types for prompt configuration, assembly, and processing
 */

/**
 * Request data for prompt processing
 */
export interface RequestData {
  type: string;
  thema: string;
  details?: string;
  requestType?: string;
  locale?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Enriched state with documents and knowledge
 */
export interface EnrichedState {
  documents?: Array<{
    title: string;
    content: string;
    source_url?: string;
    metadata?: Record<string, unknown>;
  }>;
  knowledge?: Array<{
    title: string;
    snippet: string;
    content?: string;
  }>;
  [key: string]: unknown;
}

/**
 * Prompt configuration loaded from JSON files
 */
export interface PromptConfig {
  id?: string;
  name: string;
  description?: string;
  systemRole: string;
  systemRoleExtensions?: Record<string, string>;
  systemRoleAppendix?: string;
  userPromptTemplate?: string;
  requestTemplate?: string;
  customPromptTemplate?: string;
  webSearchQuery?: string;
  formatting?: string;
  taskInstructions?: string;
  outputFormat?: string;
  requestTypeMapping?: Record<string, string>;
  shortFormThreshold?: number;
  options?: {
    max_tokens?: number;
    temperature?: number;
    [key: string]: unknown;
  };
  validation?: {
    required?: string[];
    errorMessage?: string;
  };
  features?: {
    webSearch?: boolean;
    urlCrawl?: boolean;
    docQnA?: boolean;
    customPromptFromDb?: boolean;
  };
  platforms?: Record<string, {
    style?: string;
    focus?: string;
    additionalGuidelines?: string;
    maxLength?: number;
  }>;
  types?: Record<string, {
    systemRole?: string;
    requestTemplate?: string;
    options?: Record<string, unknown>;
  }>;
  tools?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * AI generation options
 */
export interface AIOptions {
  max_tokens?: number;
  temperature?: number;
  tools?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Assembled prompt ready for AI generation
 */
export interface AssembledPrompt {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<Record<string, unknown>>;
}

/**
 * Template context for SimpleTemplateEngine
 */
export interface TemplateContext {
  [key: string]: unknown;
}

/**
 * Processing result from AI generation
 */
export interface ProcessingResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}
