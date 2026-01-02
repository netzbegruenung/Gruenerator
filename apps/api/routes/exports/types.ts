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
    citationIndex?: string;
}

export interface Citation {
    index: string;
    document_title?: string;
    cited_text?: string;
    similarity_score?: number;
    source_url?: string;
}

export interface ExportRequestBody {
    content: string;
    title?: string;
    citations?: Citation[];
}

export interface ExportResponse {
    success: boolean;
    message?: string;
    error?: string;
}
