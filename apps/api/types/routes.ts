/**
 * Shared Types for Claude Route Handlers
 *
 * This file contains all shared types used across claude_* route files,
 * including tool calling, search results, and response formats.
 */

// Note: Request, Response types are augmented in types/express.d.ts
// - Request has user, session, subdomain, siteData, mobileAuth
// - Express.Locals has aiWorkerPool
// These augmentations are automatically available when importing from 'express'

// ============================================================================
// Tool Calling Types (for gruenerator_ask and suggest_edits)
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface MessageContent {
  role: 'user' | 'assistant';
  content: string | ContentBlock[] | ToolResult[];
}

// ============================================================================
// Search & Document Types
// ============================================================================

export interface SearchResult {
  document_id: string;
  title: string;
  content: string;
  similarity_score: number;
  filename?: string;
  chunk_index?: number;
  relevance_info?: string;
}

export interface DocumentContext {
  index: number;
  title: string;
  content: string;
  metadata: {
    document_id: string;
    similarity_score: number;
    chunk_index: number;
    filename?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Response Types
// ============================================================================

export interface Citation {
  citation_number: number;
  quote: string;
  document_title: string;
}

export interface Source {
  document_id: string;
  title: string;
  filename?: string;
}

export interface CitationResult {
  answer: string;
  citations: Citation[];
  sources: Source[];
}

export interface EditChange {
  text_to_find?: string;
  replacement_text: string;
  full_replace?: boolean;
}

export interface EditSuggestionResult {
  changes: EditChange[];
  summary: string;
}

// ============================================================================
// Website Generation Types (for claude_website)
// ============================================================================

export interface WebsiteTheme {
  title: string;
  content: string;
  imageUrl?: string;
}

export interface WebsiteAction {
  text: string;
  link: string;
  imageUrl?: string;
}

export interface WebsiteContent {
  hero: {
    heading: string;
    text: string;
  };
  about: {
    title: string;
    content: string;
  };
  hero_image: {
    title: string;
    subtitle: string;
    imageUrl?: string;
  };
  themes: WebsiteTheme[];
  actions: WebsiteAction[];
  contact: {
    title: string;
    email: string;
    backgroundImageUrl?: string;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type for JSON-parsable values
 */
export type JsonParsable = string | Record<string, unknown> | null;

/**
 * Generic generation context for session-based features
 */
export interface GenerationContext {
  prompt?: string;
  type?: string;
  timestamp?: string;
  [key: string]: unknown;
}
