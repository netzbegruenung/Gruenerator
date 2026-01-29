import { apiRequest } from '@gruenerator/shared/api';

export interface Document {
  id: string;
  title: string;
  type: string;
  source_type: string;
  full_content?: string;
  word_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SavedText {
  id: string;
  title: string;
  content: string;
  document_type: string;
  word_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CombinedContentItem {
  id: string;
  title?: string;
  type?: string;
  source_type?: string;
  full_content?: string;
  word_count?: number;
  created_at?: string;
  updated_at?: string;
  itemType: 'document' | 'text';
}

export interface AnweisungenWissen {
  knowledge?: KnowledgeEntry[];
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export async function fetchCombinedContent(): Promise<{
  documents: Document[];
  texts: SavedText[];
}> {
  const response = await apiRequest<{ documents: Document[]; texts: SavedText[] }>(
    'get',
    '/documents/combined-content'
  );
  return response;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiRequest('delete', `/documents/${documentId}`);
}

export async function deleteText(textId: string): Promise<void> {
  await apiRequest('delete', `/auth/saved-texts/${textId}`);
}

export async function updateTextTitle(textId: string, title: string): Promise<void> {
  await apiRequest('put', `/auth/saved-texts/${textId}/title`, { title });
}

export async function fetchAnweisungenWissen(): Promise<AnweisungenWissen> {
  const response = await apiRequest<AnweisungenWissen>('get', '/auth/anweisungen-wissen');
  return response;
}

export async function saveAnweisungenWissen(data: AnweisungenWissen): Promise<void> {
  await apiRequest('put', '/auth/anweisungen-wissen', data);
}
