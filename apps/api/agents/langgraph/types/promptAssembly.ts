/**
 * Type definitions for Prompt Assembly Graph
 *
 * This module provides comprehensive type safety for the prompt assembly pipeline,
 * including state management, document processing, and AI service integration.
 */

import type { ClaudeDocument, ClaudeMessage } from '../../../services/attachments/types.js';
import type { ClaudeTool } from '../../../services/tools/types.js';

// ============================================================================
// Locale Types
// ============================================================================

export type Locale = 'de-DE' | 'de-AT';

export type Platform = 'facebook' | 'instagram' | 'twitter' | 'linkedin' | string;

// ============================================================================
// Request and State Types
// ============================================================================

/**
 * User request object with optional fields for different generation types
 */
export interface RequestObject {
  theme?: string | undefined;
  thema?: string | undefined;
  details?: string | undefined;
  platforms?: Platform[] | undefined;
  zitatgeber?: string | undefined;
  textForm?: string | undefined;
  presseabbinder?: string | undefined;
  [key: string]: unknown;
}

/**
 * Enrichment metadata from request processing
 */
export interface EnrichmentMetadata {
  enableDocQnA?: boolean | undefined;
  [key: string]: unknown;
}

/**
 * Content example for prompt assembly (e.g., social media posts)
 */
export interface ContentExample {
  content: string;
  platform?: Platform | undefined;
  [key: string]: unknown;
}

/**
 * Main state object for prompt assembly graph
 * Based on patterns from WebSearchState and ImageSelectionState
 */
export interface PromptAssemblyState {
  // Core prompt configuration
  systemRole: string;
  locale?: Locale | undefined;

  // Content inputs
  request?: string | RequestObject | null | undefined;
  requestFormatted?: string | null | undefined;
  documents?: ClaudeDocument[] | undefined;
  knowledge?: string[] | undefined;
  examples?: ContentExample[] | undefined;

  // Instructions and configuration (allow null for compatibility with EnrichedState)
  instructions?: string | null | undefined;
  toolInstructions?: string[] | undefined;
  constraints?: string | null | undefined;
  formatting?: string | null | undefined;
  taskInstructions?: string | null | undefined;
  outputFormat?: string | null | undefined;

  // Tools
  tools?: ClaudeTool[] | undefined;

  // Metadata
  type?: string | undefined;
  enrichmentMetadata?: EnrichmentMetadata | undefined;
  selectedDocumentIds?: string[] | undefined;
}

// ============================================================================
// Document and Content Block Types
// ============================================================================

/**
 * Document block with type discriminator
 */
export interface DocumentBlock {
  type: 'document' | 'image' | 'text';
  source: DocumentSource;
}

/**
 * Document source with optional metadata
 */
export interface DocumentSource {
  type: 'base64' | 'text' | string;
  data?: string | undefined;
  name?: string | undefined;
  media_type?: string | undefined;
  url?: string | undefined;
  text?: string | undefined;
  metadata?: DocumentMetadata | undefined;
}

/**
 * Metadata for document sources (e.g., crawled URLs)
 */
export interface DocumentMetadata {
  contentSource?: 'url_crawl' | string | undefined;
  title?: string | undefined;
  url?: string | undefined;
  [key: string]: unknown;
}

/**
 * Message content blocks for prompt assembly
 */
export interface MessageContent {
  type: 'text' | 'document' | 'image' | 'document_url';
  text?: string | undefined;
  source?: DocumentSource | undefined;
  documentUrl?: string | undefined;
}

// ============================================================================
// Assembled Prompt Types
// ============================================================================

/**
 * Final assembled prompt ready for AI generation with Claude-specific types
 * Note: Uses ClaudeMessage[] for more specific typing than base AssembledPrompt
 */
export interface PromptAssemblyResult {
  system: string;
  messages: ClaudeMessage[];
  tools: ClaudeTool[];
  enrichmentMetadata?: EnrichmentMetadata | undefined;
}

/**
 * Result from document QnA precomputation
 */
export interface DocQnAResult {
  knowledgeCapsule: string | null;
  suppressDocs: boolean;
}

// ============================================================================
// Service Integration Types
// ============================================================================

/**
 * Mistral client interface (optional dependency)
 */
export interface MistralClient {
  files?: {
    upload?: (payload: FileUploadPayload) => Promise<FileUploadResponse>;
    create?: (payload: FileUploadPayload) => Promise<FileUploadResponse>;
    add?: (payload: FileUploadPayload) => Promise<FileUploadResponse>;
    getSignedUrl?: (params: { fileId: string }) => Promise<SignedUrlResponse>;
  };
  chat?: {
    complete: (params: ChatCompletionParams) => Promise<ChatCompletionResponse>;
  };
}

/**
 * File upload payload for Mistral Files API
 */
export interface FileUploadPayload {
  file: {
    fileName: string;
    content: Buffer;
  };
  purpose: string;
}

/**
 * File upload response from Mistral API
 */
export interface FileUploadResponse {
  id?: string | undefined;
  file?: { id?: string };
  data?: { id?: string };
}

/**
 * Signed URL response from Mistral Files API
 */
export interface SignedUrlResponse {
  url: string;
}

/**
 * Chat completion parameters for Mistral API
 */
export interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  max_tokens: number;
  temperature: number;
  top_p: number;
}

/**
 * Chat completion response from Mistral API
 */
export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
    };
  }>;
  response?: {
    data?: {
      [key: string]: unknown;
    };
  };
}

/**
 * Content examples service interface
 */
export interface ContentExamplesService {
  getExamples: (
    platform: string,
    searchQuery: string,
    options: GetExamplesOptions
  ) => Promise<Array<{ content: string; [key: string]: unknown }>>;
}

/**
 * Options for fetching content examples
 */
export interface GetExamplesOptions {
  limit: number;
  fallbackToRandom: boolean;
}

// ============================================================================
// Function Parameter Types
// ============================================================================

/**
 * Parameters for buildSystemText function
 */
export interface BuildSystemTextParams {
  systemRole: string;
  toolInstructions?: string[] | undefined;
  constraints?: string | null | undefined;
  formatting?: string | null | undefined;
  locale?: Locale | undefined;
}

/**
 * Parameters for buildMainUserContent function
 */
export interface BuildMainUserContentParams {
  examples?: ContentExample[] | undefined;
  knowledge?: string[] | undefined;
  instructions?: string | null | undefined;
  request?: string | RequestObject | null | undefined;
  toolInstructions?: string[] | undefined;
  constraints?: string | null | undefined;
  formatting?: string | null | undefined;
  taskInstructions?: string | null | undefined;
  outputFormat?: string | null | undefined;
  locale?: Locale | undefined;
}

/**
 * Flags for async prompt assembly
 */
export interface PromptAssemblyFlags {
  [key: string]: unknown;
}
