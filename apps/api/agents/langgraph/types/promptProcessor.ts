/**
 * Type definitions for PromptProcessor
 * Core types for prompt configuration, assembly, and processing
 */

import { type ClaudeTool } from '../../../services/tools/types.js';

/**
 * Request data for prompt processing
 */
export interface RequestData {
  type: string;
  thema: string;
  details?: string | undefined;
  requestType?: string | undefined;
  locale?: string | undefined;
  userId?: string | undefined;
  sessionId?: string | undefined;
  [key: string]: unknown;
}

/**
 * Enriched state with documents and knowledge
 */
export interface EnrichedState {
  documents?: Array<{
    title: string;
    content: string;
    source_url?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }>;
  knowledge?: string[] | undefined;
  [key: string]: unknown;
}

/**
 * Prompt configuration loaded from JSON files
 */
export interface PromptConfig {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  systemRole: string;
  systemRoleExtensions?: Record<string, string> | undefined;
  systemRoleAppendix?: string | undefined;
  userPromptTemplate?: string | undefined;
  requestTemplate?: string | undefined;
  customPromptTemplate?: string | undefined;
  webSearchQuery?: string | undefined;
  formatting?: string | undefined;
  taskInstructions?: string | undefined;
  outputFormat?: string | undefined;
  requestTypeMapping?: Record<string, string> | undefined;
  shortFormThreshold?: number | undefined;
  options?: {
    max_tokens?: number | undefined;
    temperature?: number | undefined;
    [key: string]: unknown;
  };
  validation?: {
    required?: string[] | undefined;
    errorMessage?: string | undefined;
  };
  features?: {
    webSearch?: boolean | undefined;
    urlCrawl?: boolean | undefined;
    docQnA?: boolean | undefined;
    customPromptFromDb?: boolean | undefined;
    notebookEnrich?: boolean | undefined;
  };
  platforms?: Record<
    string,
    {
      style?: string | undefined;
      focus?: string | undefined;
      additionalGuidelines?: string | undefined;
      maxLength?: number | undefined;
    }
  >;
  types?: Record<
    string,
    {
      systemRole?: string | undefined;
      requestTemplate?: string | undefined;
      options?: Record<string, unknown> | undefined;
    }
  >;
  tools?: ClaudeTool[] | undefined;
  [key: string]: unknown;
}

/**
 * AI generation options
 */
export interface AIOptions {
  max_tokens?: number | undefined;
  temperature?: number | undefined;
  tools?: ClaudeTool[] | undefined;
  [key: string]: unknown;
}

/**
 * Assembled prompt ready for AI generation
 */
export interface AssembledPrompt {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<Record<string, unknown>> | undefined;
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
  content?: string | undefined;
  error?: string | undefined;
  usage?: {
    input_tokens?: number | undefined;
    output_tokens?: number | undefined;
  };
}
