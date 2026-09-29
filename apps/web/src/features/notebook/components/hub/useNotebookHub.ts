import {
  type AttachWolkeBody,
  type AttachWolkeResponse,
  type LinkedDocRef,
  type TransformedCollection,
  type UpdateCollectionBody,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useNotebookCollection } from '../../hooks/useNotebookCollection';

type MetaPatch = Partial<
  Pick<
    UpdateCollectionBody,
    'name' | 'description' | 'labels' | 'wolke_folders' | 'linked_docs' | 'wordpress_sites'
  >
>;

function errorOf(result: { status: number; body: unknown }, fallback: string): ApiError {
  const body = result.body as { error?: unknown } | null;
  const message = typeof body?.error === 'string' && body.error ? body.error : fallback;
  return new ApiError(result.status, message);
}

/**
 * Lesen und Schreiben des Notebook-Hubs. Es gibt keinen lokalen Entwurf: jede
 * Aktion geht sofort an den Server, danach wird die Collection neu geladen.
 * Den Indexierungsstand pollt `useNotebookCollection` selbst, solange etwas
 * läuft — auch nach „Neu indexieren", das den Status serverseitig zurücksetzt.
 */
export function useNotebookHub(slugOrId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useNotebookCollection(slugOrId);
  const collection = query.data?.collection ?? null;
  const id = collection?.id ?? null;

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] }),
      queryClient.invalidateQueries({ queryKey: ['notebookCollections'] }),
    ]);
  }, [queryClient]);

  const requireCollection = useCallback((): TransformedCollection => {
    if (!collection) throw new Error('Notebook ist noch nicht geladen.');
    return collection;
  }, [collection]);

  /**
   * Die Update-Route überschreibt Beschreibung und Prompt mit dem, was sie
   * bekommt — ein Patch muss deshalb die gespeicherten Werte mitschicken.
   */
  const saveMeta = useCallback(
    async (patch: MetaPatch) => {
      const current = requireCollection();
      const legacyWolke = current.selection_mode === 'wolke';
      const result = await getContractsClient().notebookCollections.updateCollection({
        params: { id: current.id },
        body: {
          name: current.name,
          description: current.description,
          custom_prompt: current.custom_prompt,
          selection_mode: legacyWolke ? 'wolke' : 'documents',
          ...(legacyWolke ? { wolke_share_link_ids: current.wolke_share_link_ids ?? [] } : {}),
          ...patch,
        },
      });
      if (result.status !== 200) throw errorOf(result, 'Speichern fehlgeschlagen.');
      await refresh();
    },
    [requireCollection, refresh]
  );

  const addDocuments = useCallback(
    async (documentIds: string[], linkedDocs?: LinkedDocRef[]) => {
      if (!id || documentIds.length === 0) return;
      const result = await getContractsClient().notebookCollections.addDocuments({
        params: { id },
        body: { document_ids: documentIds, ...(linkedDocs ? { linked_docs: linkedDocs } : {}) },
      });
      if (result.status !== 200) throw errorOf(result, 'Quellen konnten nicht angehängt werden.');
      await refresh();
    },
    [id, refresh]
  );

  /** Nacheinander: jeder Aufruf zählt `document_count` aus dem aktuellen Bestand neu. */
  const removeDocuments = useCallback(
    async (documentIds: string[]) => {
      if (!id) return;
      try {
        for (const documentId of documentIds) {
          const result = await getContractsClient().notebookCollections.removeDocument({
            params: { id, documentId },
          });
          if (result.status !== 200) throw errorOf(result, 'Entfernen fehlgeschlagen.');
        }
      } finally {
        await refresh();
      }
    },
    [id, refresh]
  );

  /** Liefert die Meldungen des Servers, damit der Aufrufer sie zusammenfassen kann. */
  const reindex = useCallback(
    async (documentIds: string[]): Promise<{ queued: number; messages: string[] }> => {
      if (!id) return { queued: 0, messages: [] };
      let queued = 0;
      const messages: string[] = [];
      try {
        for (const documentId of documentIds) {
          const result = await getContractsClient().notebookCollections.reindexDocument({
            params: { id, documentId },
          });
          if (result.status !== 200) throw errorOf(result, 'Neu indexieren ist fehlgeschlagen.');
          if (result.body.status === 'queued') queued += 1;
          else messages.push(result.body.message);
        }
      } finally {
        await refresh();
      }
      return { queued, messages };
    },
    [id, refresh]
  );

  const attachWolke = useCallback(
    async (body: AttachWolkeBody): Promise<AttachWolkeResponse> => {
      if (!id) throw new Error('Notebook ist noch nicht geladen.');
      try {
        const result = await getContractsClient().notebookCollections.attachWolke({
          params: { id },
          body,
        });
        if (result.status !== 200) throw errorOf(result, 'Der Wolke-Ordner ließ sich nicht lesen.');
        return result.body;
      } finally {
        await refresh();
      }
    },
    [id, refresh]
  );

  return useMemo(
    () => ({
      query,
      collection,
      refresh,
      saveMeta,
      addDocuments,
      removeDocuments,
      reindex,
      attachWolke,
    }),
    [query, collection, refresh, saveMeta, addDocuments, removeDocuments, reindex, attachWolke]
  );
}

export type NotebookHubApi = ReturnType<typeof useNotebookHub>;
