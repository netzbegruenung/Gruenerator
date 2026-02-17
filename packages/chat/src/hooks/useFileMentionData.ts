import { useState, useCallback, useRef } from 'react';
import { useChatConfigStore } from '../stores/chatConfigStore';
import type {
  NotebookCollectionItem,
  DocumentSearchResult,
  UserDocumentItem,
  UserTextItem,
} from '../lib/documentMentionables';

interface FileMentionDataState {
  collections: NotebookCollectionItem[];
  documents: UserDocumentItem[];
  texts: UserTextItem[];
  loadingCollections: boolean;
  loadingContent: boolean;
  error: string | null;
  lastFetchedCollections: number;
  lastFetchedContent: number;
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

export function useFileMentionData() {
  const [state, setState] = useState<FileMentionDataState>({
    collections: [],
    documents: [],
    texts: [],
    loadingCollections: false,
    loadingContent: false,
    error: null,
    lastFetchedCollections: 0,
    lastFetchedContent: 0,
  });

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCollections = useCallback(async () => {
    const now = Date.now();
    if (state.collections.length > 0 && now - state.lastFetchedCollections < STALE_MS) {
      return;
    }

    setState((prev) => ({ ...prev, loadingCollections: true, error: null }));

    try {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch('/api/auth/notebook-collections');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = (await response.json()) as any;
      const data = Array.isArray(json) ? json : json.collections || [];
      const collections: NotebookCollectionItem[] = data.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || null,
        documentCount: c.document_count ?? c.documentCount ?? c.documents?.length ?? 0,
        documents: (c.documents || []).map((d: any) => ({
          id: d.id,
          title: d.title || d.name || 'Unbekanntes Dokument',
          pageCount: d.page_count ?? d.pageCount,
          sourceType: d.source_type ?? d.sourceType,
        })),
      }));

      setState((prev) => ({
        ...prev,
        collections,
        loadingCollections: false,
        error: null,
        lastFetchedCollections: Date.now(),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loadingCollections: false,
        error: err instanceof Error ? err.message : 'Fehler beim Laden',
      }));
    }
  }, [state.collections.length, state.lastFetchedCollections]);

  const fetchCombinedContent = useCallback(async () => {
    const now = Date.now();
    if (
      (state.documents.length > 0 || state.texts.length > 0) &&
      now - state.lastFetchedContent < STALE_MS
    ) {
      return;
    }

    setState((prev) => ({ ...prev, loadingContent: true }));

    try {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch('/api/auth/documents/combined-content');

      if (!response.ok) {
        setState((prev) => ({ ...prev, loadingContent: false }));
        return;
      }

      const json = (await response.json()) as any;
      const rawDocs = json.data?.documents || [];
      const rawTexts = json.data?.texts || [];

      const documents: UserDocumentItem[] = rawDocs.map((d: any) => ({
        id: d.id,
        title: d.title || d.filename || 'Dokument',
        filename: d.filename,
        sourceType: d.source_type ?? d.sourceType,
        createdAt: d.created_at ?? d.createdAt,
        contentPreview: d.content_preview ?? d.contentPreview,
      }));

      const texts: UserTextItem[] = rawTexts.map((t: any) => ({
        id: t.id,
        title: t.title || 'Unbenannter Text',
        documentType: t.document_type ?? t.documentType ?? 'text',
        wordCount: t.word_count ?? t.wordCount ?? 0,
        createdAt: t.created_at ?? t.createdAt,
      }));

      setState((prev) => ({
        ...prev,
        documents,
        texts,
        loadingContent: false,
        lastFetchedContent: Date.now(),
      }));
    } catch {
      setState((prev) => ({ ...prev, loadingContent: false }));
    }
  }, [state.documents.length, state.texts.length, state.lastFetchedContent]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchCollections(), fetchCombinedContent()]);
  }, [fetchCollections, fetchCombinedContent]);

  const searchInCollection = useCallback(
    (collectionId: string, query: string): Promise<DocumentSearchResult[]> => {
      return new Promise((resolve) => {
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
        }

        searchTimerRef.current = setTimeout(async () => {
          try {
            const { fetch: configFetch } = useChatConfigStore.getState();
            const response = await configFetch(
              `/api/auth/notebook-collections/${collectionId}/search?q=${encodeURIComponent(query)}`
            );

            if (!response.ok) {
              resolve([]);
              return;
            }

            const results = (await response.json()) as DocumentSearchResult[];
            resolve(results);
          } catch {
            resolve([]);
          }
        }, 300);
      });
    },
    []
  );

  return {
    collections: state.collections,
    documents: state.documents,
    texts: state.texts,
    loadingCollections: state.loadingCollections,
    loadingContent: state.loadingContent,
    error: state.error,
    fetchCollections,
    fetchCombinedContent,
    fetchAll,
    searchInCollection,
  };
}
