/**
 * Type definitions for attachment processing services
 */

// ============================================================================
// Base Attachment Types
// ============================================================================

/**
 * Base attachment interface with common fields
 */
export interface BaseAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

/**
 * File attachment (PDF, images) with base64 data
 */
export interface FileAttachment extends BaseAttachment {
  type: 'application/pdf' | 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp';
  data: string; // Base64 encoded
}

/**
 * Crawled URL content attachment
 */
export interface CrawledUrlAttachment extends BaseAttachment {
  type: 'crawled_url';
  content: string;
  url: string;
  displayUrl?: string;
  metadata?: {
    wordCount?: number;
    extractedAt?: string;
  };
}

/**
 * Union type for all attachment types
 */
export type Attachment = FileAttachment | CrawledUrlAttachment;

/**
 * Image attachment (for canvas routes)
 */
export interface ImageAttachment {
  type: 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string; // Base64 or data URL
  name?: string;
  size?: number;
  source?: string;
}

// ============================================================================
// Processing & Results Types
// ============================================================================

/**
 * Attachment processing result for routes
 */
export interface AttachmentProcessingResult {
  hasAttachments: boolean;
  summary: AttachmentSummary | null;
  validated: boolean;
  error: string | null;
  documents?: ClaudeDocument[];
}

/**
 * Summary of attachments for logging
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

// ============================================================================
// Claude API Message Types
// ============================================================================

/**
 * Claude API content block types
 */
export type ClaudeContentBlock = ClaudeTextBlock | ClaudeImageBlock | ClaudeDocumentBlock;

/**
 * Text content block for Claude API
 */
export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

/**
 * Image content block for Claude API
 */
export interface ClaudeImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/webp';
    data: string;
  };
}

/**
 * Document content block for Claude API
 */
export interface ClaudeDocumentBlock {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
}

/**
 * Claude API message with role and content blocks
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: ClaudeContentBlock[];
}

/**
 * Document format for PromptBuilder.addDocuments()
 */
export interface ClaudeDocument {
  type: 'text' | 'image' | 'document';
  source: {
    type: 'base64' | 'text';
    media_type?: string;
    data?: string;
    text?: string;
    metadata?: any;
  };
}

// ============================================================================
// Multer File Types (for canvas routes)
// ============================================================================

/**
 * Multer-compatible file object with memory storage (for dreizeilen_canvas)
 */
export interface MulterMemoryFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * Multer-compatible file object with disk storage (for zitat_canvas)
 */
export interface MulterDiskFile extends MulterMemoryFile {
  destination: string;
  filename: string;
  path: string;
  cleanup?: () => Promise<void>;
}
