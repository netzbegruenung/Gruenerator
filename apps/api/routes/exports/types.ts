/**
 * Type definitions for document exports
 */

export interface FormattedSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface FormattedParagraph {
  segments: FormattedSegment[];
  isHeader: boolean;
  headerLevel: number | null;
}

export interface ParsedElement {
  content: string;
  isHeader: boolean;
  headerLevel: number | null;
  tag: string;
}

export interface ContentSection {
  header: string | null;
  content: string[];
}

export interface CitationSegment {
  text: string;
  isCitation: boolean;
  citationIndex?: string | undefined;
}

export interface Citation {
  index: string;
  document_title?: string | undefined;
  cited_text?: string | undefined;
  similarity_score?: number | undefined;
  source_url?: string | undefined;
}

export interface ExportRequestBody {
  content: string;
  title?: string | undefined;
  citations?: Citation[] | undefined;
}

export interface ExportResponse {
  success: boolean;
  message?: string | undefined;
  error?: string | undefined;
}
