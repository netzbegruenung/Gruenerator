export type DocumentSourceType = 'notebook' | 'document' | 'text';

export interface DocumentMention {
  documentId: string;
  documentTitle: string;
  collectionId: string;
  collectionName: string;
  slug: string;
  sourceType: DocumentSourceType;
}

export interface UserDocumentItem {
  id: string;
  title: string;
  filename?: string;
  sourceType?: string;
  createdAt: string;
  contentPreview?: string;
}

export interface UserTextItem {
  id: string;
  title: string;
  documentType: string;
  wordCount: number;
  createdAt: string;
}

export interface NotebookCollectionItem {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  documents: NotebookDocumentItem[];
}

export interface NotebookDocumentItem {
  id: string;
  title: string;
  pageCount?: number;
  sourceType?: string;
}

export interface DocumentSearchResult {
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
}

const slugToDocumentMap = new Map<string, DocumentMention>();

export function documentToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function registerDocumentSlug(slug: string, doc: DocumentMention): void {
  slugToDocumentMap.set(slug, doc);
}

export function resolveDocumentSlug(slug: string): DocumentMention | null {
  return slugToDocumentMap.get(slug) ?? null;
}

export function clearDocumentSlugs(): void {
  slugToDocumentMap.clear();
}
