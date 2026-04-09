/**
 * Request/Response Type Definitions
 */

import type { Response } from 'express';

/**
 * AI worker result
 */
export interface AIWorkerResult {
  success: boolean;
  content?: string | undefined;
  metadata?: {
    webSearchSources?: WebSearchSource[] | undefined;
    [key: string]: unknown;
  };
  agent?: string | undefined;
  [key: string]: unknown;
}

/**
 * Web search source
 */
export interface WebSearchSource {
  url: string;
  title: string;
  snippet?: string | undefined;
  [key: string]: unknown;
}

/**
 * Attachment summary
 */
export interface AttachmentSummary {
  count: number;
  totalSizeMB: number;
  types: string[];
  files: Array<{
    name: string;
    type: string;
    sizeMB: number;
  }>;
}

/**
 * Enrichment summary (includes all source types)
 */
export interface EnrichmentSummary {
  webSearchSources?: WebSearchSource[] | undefined;
  [key: string]: unknown;
}

/**
 * Attachment processing information
 */
export interface AttachmentInfo {
  hasAttachments: boolean;
  summary?: AttachmentSummary | undefined;
  enrichmentSummary?: EnrichmentSummary | undefined;
  [key: string]: unknown;
}

/**
 * Formatted success response
 */
export interface SuccessResponse {
  success: true;
  content: string;
  metadata: {
    timestamp: string;
    [key: string]: unknown;
  };
  agent?: string | undefined;
}

/**
 * Formatted error response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
  code?: string | undefined;
}

/**
 * Error response with status code
 */
export interface ErrorResponseWithStatus {
  response: ErrorResponse;
  statusCode: number;
}

/**
 * Message content block
 */
export interface MessageContentBlock {
  text?: string | undefined;
  content?: string | undefined;
  [key: string]: unknown;
}

/**
 * Message object
 */
export interface Message {
  role: string;
  content: string | MessageContentBlock[] | unknown;
}

/**
 * OpenAI compatible message
 */
export interface OpenAIMessage {
  role: string;
  content: string;
}

/**
 * Message preprocessing input
 */
export interface MessagePreprocessingInput {
  systemPrompt?: string | undefined;
  messages: Message[];
}
