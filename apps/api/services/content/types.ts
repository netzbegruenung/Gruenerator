/**
 * Content Detection Service Types
 */

/**
 * High-level content type classification
 */
export type ContentType = 'heading' | 'paragraph' | 'list' | 'code' | 'table';

/**
 * Header information extracted from markdown
 */
export interface HeaderInfo {
  level: number;
  text: string;
}

/**
 * Markdown structure analysis result
 */
export interface MarkdownStructure {
  headers: HeaderInfo[];
  lists: number;
  codeBlocks: number;
  tables: number;
  blockquotes: boolean;
}

/**
 * German language patterns detected in text
 */
export interface GermanPatterns {
  hasUmlauts: boolean;
  hasSectionSymbol: boolean;
  germanQuotes: boolean;
  months: boolean;
}

/**
 * URL detection result
 */
export interface UrlDetectionResult {
  urls: string[];
  uniqueCount: number;
}

/**
 * Attachment with URL information
 */
export interface AttachmentWithUrl {
  url?: string;
  type?: string;
}
