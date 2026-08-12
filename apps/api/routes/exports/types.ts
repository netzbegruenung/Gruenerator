/**
 * Type definitions for document exports
 */

export interface FormattedSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  code?: boolean | undefined;
  strike?: boolean | undefined;
  /** Link target. The segment text is the label. */
  href?: string | undefined;
}

/**
 * One rendered block. A discriminated union on `kind` — narrow through
 * `block.kind`, never by destructuring (see CLAUDE.md, type-safety rule 2).
 */
export type FormattedBlock =
  | { kind: 'heading'; level: number; segments: FormattedSegment[] }
  | { kind: 'paragraph'; segments: FormattedSegment[]; quoteDepth: number }
  | {
      kind: 'listItem';
      segments: FormattedSegment[];
      ordered: boolean;
      /** 0-based nesting depth. */
      level: number;
      /** Groups consecutive items of the same list so Word restarts numbering. */
      listId: number;
      quoteDepth: number;
    }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'table'; header: FormattedSegment[][]; rows: FormattedSegment[][][] }
  | { kind: 'divider' }
  | { kind: 'image'; src: string; alt: string };

export interface ParsedElement {
  content: string;
  isHeader: boolean;
  headerLevel: number | null;
  tag: string;
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
