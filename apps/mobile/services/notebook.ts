import { apiRequest } from './api';

import type { NotebookSource } from '../stores/notebookChatStore';

interface ApiCitation {
  index?: string | number;
  title?: string;
  document_title?: string;
  url?: string;
  source_url?: string | null;
  documentId?: string;
  document_id?: string;
  snippet?: string;
  cited_text?: string;
  similarity_score?: number;
  collection_name?: string;
  collectionName?: string;
  chunk_index?: number;
  collection_id?: string;
}

function mapCitation(citation: ApiCitation): NotebookSource {
  return {
    title: citation.document_title || citation.title || '',
    url: citation.source_url || citation.url || undefined,
    documentId: citation.document_id || citation.documentId,
    snippet: citation.cited_text || citation.snippet,
    index: citation.index,
    cited_text: citation.cited_text,
    similarity_score: citation.similarity_score,
    collectionName: citation.collection_name || citation.collectionName,
    chunk_index: citation.chunk_index,
    collection_id: citation.collection_id,
  };
}

export interface NotebookQueryParams {
  question: string;
  collectionId: string;
  locale?: 'de-DE' | 'de-AT';
}

export interface MultiNotebookQueryParams {
  question: string;
  collectionIds: string[];
  locale?: 'de-DE' | 'de-AT';
}

export interface NotebookQueryResponse {
  resultId: string;
  question: string;
  answer: string;
  sources: NotebookSource[];
  citations?: NotebookSource[];
}

interface ApiCollectionSources {
  name: string;
  sources: ApiCitation[];
  allSources?: ApiCitation[];
}

export interface MultiNotebookQueryResponse {
  resultId: string;
  question: string;
  answer: string;
  citations?: NotebookSource[];
  sources?: NotebookSource[];
  sourcesByCollection: Record<string, NotebookSource[]>;
}

/**
 * Query a single notebook collection
 */
export async function queryNotebook(params: NotebookQueryParams): Promise<NotebookQueryResponse> {
  const response = await apiRequest<{
    resultId: string;
    question: string;
    answer: string;
    sources: ApiCitation[];
    citations?: ApiCitation[];
  }>('post', `/auth/notebook/${params.collectionId}/ask`, {
    question: params.question,
    mode: 'dossier',
    locale: params.locale || 'de-DE',
  });

  return {
    resultId: response.resultId,
    question: response.question,
    answer: response.answer,
    sources: (response.sources || []).map(mapCitation),
    citations: (response.citations || response.sources || []).map(mapCitation),
  };
}

/**
 * Query multiple notebook collections in parallel
 */
export async function queryMultiNotebook(
  params: MultiNotebookQueryParams
): Promise<MultiNotebookQueryResponse> {
  const response = await apiRequest<{
    resultId: string;
    question: string;
    answer: string;
    sources: ApiCitation[];
    citations?: ApiCitation[];
    sourcesByCollection: Record<string, ApiCollectionSources | ApiCitation[]>;
  }>('post', '/auth/notebook/multi/ask', {
    question: params.question,
    collectionIds: params.collectionIds,
    mode: 'dossier',
    locale: params.locale || 'de-DE',
  });

  const mappedSourcesByCollection: Record<string, NotebookSource[]> = {};
  for (const [collectionId, collectionData] of Object.entries(response.sourcesByCollection || {})) {
    // Backend returns { name, sources, allSources } per collection, not a flat array
    const sourcesArray = Array.isArray(collectionData)
      ? collectionData
      : (collectionData as ApiCollectionSources)?.sources || [];
    mappedSourcesByCollection[collectionId] = sourcesArray.map(mapCitation);
  }

  return {
    resultId: response.resultId,
    question: response.question,
    answer: response.answer,
    citations: (response.citations || []).map(mapCitation),
    sources: (response.sources || []).map(mapCitation),
    sourcesByCollection: mappedSourcesByCollection,
  };
}
