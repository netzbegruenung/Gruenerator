import { type MenuAction } from '@expo/ui/community/menu';
import {
  canManageShare,
  useDeleteGroupPost,
  useRemoveGroupContent,
  useSetGroupContentWrite,
  useUpdateGroupShare,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert } from 'react-native';

import {
  buildPostActions,
  canDeletePost,
  canEditPost,
  type PostMenuId,
} from '../components/projekte/postRules';
import { buildShareActions, type ShareMenuId } from '../components/projekte/shareMenu';
import { useNoticeStore } from '../stores/noticeStore';

export interface ShareItemActions {
  /** Verwaltungseinträge für diese Freigabe; leer, wenn die Person sie nicht verwalten darf. */
  actionsFor: (item: GroupFeedItem) => MenuAction[];
  run: (item: GroupFeedItem, id: string) => void;
}

/**
 * Rolle ändern, Notiz bearbeiten, anheften und Freigabe entfernen, bei eigenen Beiträgen
 * bearbeiten und löschen — die Regel
 * (Admin oder Teilende*r; Anheften nur Admin, nicht im persönlichen Projekt) und
 * die Aufrufe sind dieselben wie im Web; der Server prüft sie noch einmal.
 */
export function useShareItemActions(
  groupId: string | null,
  isAdmin: boolean | null | undefined,
  canPin = false
): ShareItemActions {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const router = useRouter();
  const { mutate: updateShare } = useUpdateGroupShare(groupId ?? '');
  const { mutate: removeContent } = useRemoveGroupContent(groupId);
  const { mutate: setWrite } = useSetGroupContentWrite(groupId);
  const { mutate: deletePost } = useDeleteGroupPost(groupId ?? '');

  return useMemo(() => {
    const fail = (error: Error) => useNoticeStore.getState().show('error', error.message);
    const done = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return {
      actionsFor: (item) =>
        item.post
          ? buildPostActions(
              canEditPost(item.post, userId),
              canDeletePost(item.post, userId, isAdmin)
            )
          : buildShareActions(item, canManageShare(item, isAdmin, userId), canPin && !!isAdmin),
      run: (item, id) => {
        const action = id as ShareMenuId | PostMenuId;
        if (action === 'edit-post') {
          if (!item.post || !groupId) return;
          router.push({
            pathname: '/(focused)/projekte/[id]/beitrag',
            params: { id: groupId, postId: item.id, body: item.post.body },
          });
        } else if (action === 'delete-post') {
          Alert.alert('Beitrag löschen?', 'Das lässt sich nicht rückgängig machen.', [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Löschen',
              style: 'destructive',
              onPress: () => deletePost(item.id, { onSuccess: done, onError: fail }),
            },
          ]);
        } else if (action === 'write' || action === 'read') {
          const write = action === 'write';
          if (write === item.projectWrite) return;
          setWrite({ contentId: item.id, write }, { onSuccess: done, onError: fail });
        } else if (action === 'pin' || action === 'unpin') {
          if (!item.share) return;
          updateShare(
            { shareId: item.share.shareId, pinned: action === 'pin' },
            { onSuccess: done, onError: fail }
          );
        } else if (action === 'note') {
          if (!item.share || !groupId) return;
          router.push({
            pathname: '/(focused)/projekte/[id]/notiz',
            params: { id: groupId, shareId: item.share.shareId, note: item.share.note ?? '' },
          });
        } else if (action === 'remove') {
          Alert.alert(
            'Aus dem Projekt entfernen?',
            `„${item.title}“ ist danach für die Mitglieder nicht mehr sichtbar.`,
            [
              { text: 'Abbrechen', style: 'cancel' },
              {
                text: 'Entfernen',
                style: 'destructive',
                onPress: () =>
                  removeContent(
                    { contentId: item.id, contentType: item.contentType },
                    { onSuccess: done, onError: fail }
                  ),
              },
            ]
          );
        }
      },
    };
  }, [isAdmin, canPin, userId, groupId, router, removeContent, setWrite, updateShare, deletePost]);
}
