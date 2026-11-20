import {
  createInProject,
  groupContentKey,
  type CreateInProjectKind,
} from '@gruenerator/shared/groups';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { type AddMenuId } from '../components/projekte/addMenu';
import {
  pickDocuments,
  postDocumentOnly,
  validatePickedDocument,
} from '../services/documentPicker';
import { useNoticeStore } from '../stores/noticeStore';
import { serverMessage } from '../utils/serverMessage';

const CREATE_KINDS: Partial<Record<AddMenuId, CreateInProjectKind>> = {
  doc: 'doc',
  sheet: 'sheet',
  board: 'board',
};

/**
 * Was das „+“ im Projekt auslöst. Neues Doc/Sheet/Board entsteht samt Freigabe in
 * einem Server-Schritt und öffnet danach wie ein Feed-Eintrag; Dateien gehen
 * einzeln hoch (ein Fehler stoppt die übrigen nicht).
 */
export function useProjectAddActions(groupId: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (groupId) void queryClient.invalidateQueries({ queryKey: groupContentKey(groupId) });
  }, [groupId, queryClient]);

  const create = useCallback(
    async (kind: CreateInProjectKind) => {
      if (!groupId) return;
      setBusy(true);
      try {
        const id = await createInProject(kind, groupId);
        refresh();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (kind === 'doc') {
          router.push({ pathname: '/(fullscreen)/doc-editor', params: { id } });
        } else if (kind === 'sheet') {
          router.push({
            pathname: '/(fullscreen)/sheet-viewer',
            params: { id, title: 'Neue Tabelle' },
          });
        } else {
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/boards/${id}`, title: 'Neues Board' },
          });
        }
      } catch (err) {
        useNoticeStore
          .getState()
          .show('error', err instanceof Error ? err.message : 'Konnte nicht angelegt werden.');
      } finally {
        setBusy(false);
      }
    },
    [groupId, refresh, router]
  );

  const upload = useCallback(async () => {
    if (!groupId) return;
    const picked = (await pickDocuments()).filter(validatePickedDocument);
    if (picked.length === 0) return;
    setBusy(true);
    let added = 0;
    let firstError: string | null = null;
    for (const doc of picked) {
      try {
        await postDocumentOnly(doc, groupId);
        added += 1;
      } catch (err) {
        firstError ??= serverMessage(err, 'Datei konnte nicht hochgeladen werden.');
      }
    }
    setBusy(false);
    if (added > 0) {
      refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (firstError) {
      const failed = picked.length - added;
      useNoticeStore
        .getState()
        .show(
          'error',
          failed > 1 ? `${failed} Dateien nicht hochgeladen.` : firstError,
          firstError
        );
    }
  }, [groupId, refresh]);

  const run = useCallback(
    (id: string) => {
      if (!groupId) return;
      const kind = CREATE_KINDS[id as AddMenuId];
      if (kind) void create(kind);
      else if (id === 'file') void upload();
      else if (id === 'text') {
        router.push({ pathname: '/(focused)/projekte/[id]/text', params: { id: groupId } });
      } else if (id === 'existing') {
        router.push({ pathname: '/(focused)/projekte/[id]/hinzufuegen', params: { id: groupId } });
      }
    },
    [groupId, create, upload, router]
  );

  return { run, busy };
}
