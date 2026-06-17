import { type LinkedDocRef } from '@gruenerator/contracts';

import { type useDocumentsStore } from '../../../stores/documentsStore';
import { platformFetch } from '../../../utils/platformFetch';

export type LinkedDocSyncResult =
  | {
      kind: 'updated';
      docId: string;
      newRef: LinkedDocRef;
      newDocumentId: string;
      oldDocumentId: string | null;
    }
  | { kind: 'vanished'; docId: string; oldDocumentId: string | null }
  | { kind: 'error'; docId: string; message: string };

interface SyncContext {
  documentsStore: ReturnType<typeof useDocumentsStore.getState>;
}

export async function syncLinkedDoc(
  ref: LinkedDocRef,
  ctx: SyncContext
): Promise<LinkedDocSyncResult> {
  let res: Response;
  try {
    res = await platformFetch(`/api/docs/${ref.docId}/export/markdown`, { credentials: 'include' });
  } catch (e) {
    return {
      kind: 'error',
      docId: ref.docId,
      message: e instanceof Error ? e.message : 'Netzwerkfehler',
    };
  }

  if (res.status === 404 || res.status === 403) {
    return { kind: 'vanished', docId: ref.docId, oldDocumentId: ref.documentId ?? null };
  }

  if (!res.ok) {
    return {
      kind: 'error',
      docId: ref.docId,
      message: `Markdown-Export fehlgeschlagen (${res.status})`,
    };
  }

  let markdown: string;
  try {
    markdown = await res.text();
  } catch (e) {
    return {
      kind: 'error',
      docId: ref.docId,
      message: e instanceof Error ? e.message : 'Lesefehler',
    };
  }

  try {
    const safeName = ref.docTitle.replace(/[^\p{L}\p{N}\s.-]+/gu, '_').slice(0, 80) || 'Dokument';
    const file = new File([markdown], `${safeName}.md`, { type: 'text/markdown' });
    const uploaded = await ctx.documentsStore.uploadFileOnly(file, file.name);

    return {
      kind: 'updated',
      docId: ref.docId,
      newRef: {
        ...ref,
        documentId: uploaded.id,
        lastSyncedAt: new Date().toISOString(),
      },
      newDocumentId: uploaded.id,
      oldDocumentId: ref.documentId ?? null,
    };
  } catch (e) {
    return {
      kind: 'error',
      docId: ref.docId,
      message: e instanceof Error ? e.message : 'Import fehlgeschlagen',
    };
  }
}
