import {
  NOTEBOOK_MAX_DOCUMENTS,
  type LinkedDocRef,
  type WolkeFolderRef,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useDocumentsStore } from '../../../stores/documentsStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';

import { syncLinkedDoc, type LinkedDocSyncResult } from './syncLinkedDoc';
import { syncWolkeFolder, type WolkeFolderSyncResult } from './syncWolkeFolder';

import type { NotebookCollection } from '../../../types/notebook';

const MAX_DOCUMENTS = NOTEBOOK_MAX_DOCUMENTS;

export type SyncProgressStatus = 'pending' | 'running' | 'done' | 'error';

export interface SyncProgressRow {
  key: string;
  kind: 'wolke' | 'doc';
  title: string;
  status: SyncProgressStatus;
  summary?: string;
  errorMessage?: string;
}

export interface FullSyncTotals {
  added: number;
  updated: number;
  removed: number;
  errors: number;
}

export function useNotebookFullSync() {
  const documentsStoreApi = useDocumentsStore;
  const { updateQACollection, isUpdating } = useNotebookCollections({ isActive: true });
  const [progress, setProgress] = useState<Record<string, SyncProgressRow>>({});
  const [totals, setTotals] = useState<FullSyncTotals | null>(null);

  const setRow = useCallback((key: string, patch: Partial<SyncProgressRow>) => {
    setProgress((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const reset = useCallback(() => {
    setProgress({});
    setTotals(null);
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ collection }: { collection: NotebookCollection }) => {
      const wolkeFolders = collection.wolke_folders ?? [];
      const linkedDocs = collection.linked_docs ?? [];
      const priorDocuments = collection.documents ?? [];

      const initial: Record<string, SyncProgressRow> = {};
      for (const f of wolkeFolders) {
        const key = `wolke-${f.shareLinkId}-${f.folderPath}`;
        initial[key] = { key, kind: 'wolke', title: f.folderName, status: 'pending' };
      }
      for (const d of linkedDocs) {
        const key = `doc-${d.docId}`;
        initial[key] = { key, kind: 'doc', title: d.docTitle, status: 'pending' };
      }
      setProgress(initial);

      // ===== Wolke phase =====
      const priorWolkeIds = new Set(
        priorDocuments.filter((d) => d.source_type === 'wolke').map((d) => String(d.id))
      );
      const wolkeResults: WolkeFolderSyncResult[] = [];
      const updatedFolders: WolkeFolderRef[] = [];
      let remainingSlots = MAX_DOCUMENTS - priorDocuments.length;

      for (const folder of wolkeFolders) {
        const key = `wolke-${folder.shareLinkId}-${folder.folderPath}`;
        setRow(key, { status: 'running' });
        const result = await syncWolkeFolder(folder, {
          documentsStore: documentsStoreApi.getState(),
          remainingSlots: Math.max(0, remainingSlots),
        });
        wolkeResults.push(result);

        if (result.kind === 'success') {
          remainingSlots -= result.newlyImported.length;
          updatedFolders.push({ ...folder, lastSyncedAt: result.updatedLastSyncedAt });
          const added = result.newlyImported.length;
          const totalNow = result.currentDocumentIds.length;
          const summary =
            added > 0 ? `${added} neu · ${totalNow} insgesamt` : `${totalNow} unverändert`;
          setRow(key, { status: 'done', summary });
        } else {
          updatedFolders.push(folder);
          setRow(key, { status: 'error', errorMessage: result.message });
        }
      }

      // Only conclude "vanished" when ALL folders synced successfully — otherwise we can't be sure.
      const allWolkeFoldersOk =
        wolkeResults.length === 0 || wolkeResults.every((r) => r.kind === 'success');
      const allWolkeNow = new Set<string>();
      for (const r of wolkeResults) {
        if (r.kind === 'success') r.currentDocumentIds.forEach((id) => allWolkeNow.add(id));
      }
      const removedWolkeIds = allWolkeFoldersOk
        ? [...priorWolkeIds].filter((id) => !allWolkeNow.has(id))
        : [];

      // ===== Docs phase =====
      const docsResults: LinkedDocSyncResult[] = [];
      const updatedLinkedDocs: LinkedDocRef[] = [];
      const removedManualIds: string[] = [];
      const addedManualIds: string[] = [];

      for (const ref of linkedDocs) {
        const key = `doc-${ref.docId}`;
        setRow(key, { status: 'running' });
        const result = await syncLinkedDoc(ref, {
          documentsStore: documentsStoreApi.getState(),
        });
        docsResults.push(result);

        if (result.kind === 'updated') {
          updatedLinkedDocs.push(result.newRef);
          if (result.oldDocumentId) removedManualIds.push(result.oldDocumentId);
          addedManualIds.push(result.newDocumentId);
          setRow(key, { status: 'done', summary: 'Aktualisiert' });
        } else if (result.kind === 'vanished') {
          if (result.oldDocumentId) removedManualIds.push(result.oldDocumentId);
          setRow(key, { status: 'done', summary: 'Nicht erreichbar — entfernt' });
        } else {
          updatedLinkedDocs.push(ref);
          setRow(key, { status: 'error', errorMessage: result.message });
        }
      }

      // ===== Build new documents list =====
      // Re-fetch the collection right before writing: the sync above can run
      // for minutes, and writing back the stale snapshot would silently revert
      // any documents added/removed concurrently (other tab, group member).
      let baseDocumentIds = priorDocuments.map((d) => String(d.id));
      let base: Pick<
        NotebookCollection,
        'name' | 'description' | 'custom_prompt' | 'selection_mode' | 'labels' | 'is_public'
      > & { public_ownership?: NotebookCollection['public_ownership'] } = collection;
      try {
        const fresh = await getContractsClient().notebookCollections.getCollection({
          params: { slugOrId: collection.id },
        });
        if (fresh.status === 200) {
          baseDocumentIds = fresh.body.collection.documents.map((d) => String(d.id));
          base = {
            name: fresh.body.collection.name,
            ...(fresh.body.collection.description != null
              ? { description: fresh.body.collection.description }
              : {}),
            ...(fresh.body.collection.custom_prompt != null
              ? { custom_prompt: fresh.body.collection.custom_prompt }
              : {}),
            selection_mode:
              (fresh.body.collection.selection_mode as NotebookCollection['selection_mode']) ??
              collection.selection_mode,
            labels: fresh.body.collection.labels ?? collection.labels,
            is_public: fresh.body.collection.is_public ?? collection.is_public,
            public_ownership: fresh.body.collection.public_ownership ?? null,
          };
        }
      } catch {
        // Refetch is best-effort: fall back to the snapshot from mutation start.
      }

      const remove = new Set<string>([...removedWolkeIds, ...removedManualIds]);
      const finalIds = new Set<string>();
      for (const id of baseDocumentIds) if (!remove.has(id)) finalIds.add(id);
      for (const r of wolkeResults) {
        if (r.kind === 'success') r.newlyImported.forEach((d) => finalIds.add(d.id));
      }
      for (const id of addedManualIds) finalIds.add(id);

      await updateQACollection(collection.id, {
        name: base.name,
        ...(base.description != null ? { description: base.description } : {}),
        ...(base.custom_prompt != null ? { custom_prompt: base.custom_prompt } : {}),
        selectionMode: base.selection_mode ?? 'documents',
        documents: [...finalIds],
        labels: base.labels ?? [],
        is_public: base.is_public,
        public_ownership: base.public_ownership ?? null,
        wolkeFolders: updatedFolders,
        linkedDocs: updatedLinkedDocs,
      });

      const newWolkeCount = wolkeResults.reduce(
        (acc, r) => acc + (r.kind === 'success' ? r.newlyImported.length : 0),
        0
      );
      setTotals({
        added: newWolkeCount + addedManualIds.length,
        updated: docsResults.filter((r) => r.kind === 'updated').length,
        removed: removedWolkeIds.length + removedManualIds.length,
        errors:
          wolkeResults.filter((r) => r.kind === 'error').length +
          docsResults.filter((r) => r.kind === 'error').length,
      });
    },
  });

  return {
    run: mutation.mutateAsync,
    isRunning: mutation.isPending || isUpdating,
    progress,
    totals,
    error: mutation.error,
    reset,
  };
}
