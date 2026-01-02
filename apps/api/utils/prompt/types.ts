export interface PlatformGuideline {
  maxLength: number;
  style: string;
  focus: string;
  additionalGuidelines: string;
}

export interface DocumentContextMetadata {
  document_id: string;
  similarity_score: number;
  chunk_index: number;
  filename?: string;
}

export interface DocumentContext {
  title: string;
  content: string;
  metadata: DocumentContextMetadata;
}

export interface Citation {
  index: string;
  cited_text: string;
  document_title: string;
  document_id: string;
  similarity_score: number;
  chunk_index: number;
  filename?: string;
}

export interface SourceInfo {
  document_id: string;
  document_title: string;
  chunk_text: string;
  similarity_score: number;
  citations: Citation[];
}

export interface ProcessedResponse {
  answer: string;
  citations: Citation[];
  sources: SourceInfo[];
}

export interface SearchDocumentsTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface AIWorkerResult {
  success: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface EnhancedAIWorkerResult extends AIWorkerResult {
  metadata?: {
    title?: string;
    contentType?: string;
    [key: string]: unknown;
  };
}

export interface FormData {
  requestType?: string;
  platforms?: string[];
  textForm?: string;
  thema?: string;
  idee?: string;
  [key: string]: unknown;
}

export type ContentType =
  | 'antrag'
  | 'kleine_anfrage'
  | 'grosse_anfrage'
  | 'pressemitteilung'
  | 'press'
  | 'social'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'linkedin'
  | 'actionIdeas'
  | 'reelScript'
  | 'rede'
  | 'wahlprogramm'
  | 'universal'
  | string;
