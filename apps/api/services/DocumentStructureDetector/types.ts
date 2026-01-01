/**
 * Type definitions for DocumentStructureDetector
 * Defines interfaces for document structure analysis and semantic boundaries
 */

export interface PatternCollection {
  chapter: RegExp[];
  section: RegExp[];
  subsection: RegExp[];
  markdown: RegExp[];
  list: RegExp[];
  table: RegExp[];
  pageBreak: RegExp[];
}

export interface Chapter {
  type: 'chapter';
  level: number;
  title: string;
  number: string;
  startLine: number;
  startPosition: number;
  endLine?: number;
  endPosition?: number;
  contentLength?: number;
  content?: string;
  sections: Section[];
}

export interface Section {
  type: 'section';
  level: number;
  title: string;
  number: string;
  startLine: number;
  startPosition: number;
  endLine?: number;
  endPosition?: number;
  contentLength?: number;
  content?: string;
  parentChapter?: string;
}

export interface ListItem {
  type: 'list';
  content: string;
  listType: 'ordered' | 'alpha' | 'unordered';
  startLine: number;
  startPosition: number;
  parentSection?: string;
  parentChapter?: string;
}

export interface TableItem {
  type: 'table';
  startLine: number;
  startPosition: number;
  parentSection?: string;
  parentChapter?: string;
}

export interface PageBreak {
  type: 'pageBreak';
  startLine: number;
  startPosition: number;
}

export type StructureItem = Chapter | Section;

export interface DocumentMetadata {
  totalLines: number;
  totalCharacters: number;
  hasChapters: boolean;
  hasSections: boolean;
  hasLists: boolean;
  hasTables: boolean;
  structureComplexity: 'simple' | 'moderate' | 'complex';
  documentType: 'book' | 'report' | 'manual' | 'list_document' | 'data_document' | 'article';
}

export interface DocumentStructure {
  chapters: Chapter[];
  sections: Section[];
  lists: ListItem[];
  tables: TableItem[];
  pageBreaks: PageBreak[];
  hierarchy: StructureItem[];
  metadata: DocumentMetadata;
}

export interface SemanticBoundary {
  position: number;
  type: 'chapter' | 'section' | 'subsection' | 'paragraph' | 'list' | 'table';
  level: number;
  title?: string;
  importance: number;
}

export interface ChapterMatch {
  number: string;
  title: string;
}

export interface SectionMatch {
  number: string;
  title: string;
}

export interface ListMatch {
  content: string;
  type: 'ordered' | 'alpha' | 'unordered';
}
