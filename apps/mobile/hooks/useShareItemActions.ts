import { type MenuAction } from '@expo/ui/community/menu';
import {
  canManageShare,
  useRemoveGroupContent,
  useSetGroupContentWrite,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Alert } from 'react-native';

import { buildShareActions, type ShareMenuId } from '../components/projekte/shareMenu';
import { useNoticeStore } from '../stores/noticeStore';

export interface ShareItemActions {
  /** Verwaltungseinträge für diese Freigabe; leer, wenn die Person sie nicht verwalten darf. */
  actionsFor: (item: GroupFeedItem) => MenuAction[];
  run: (item: GroupFeedItem, id: string) => void;
}

/**
 * Rolle ändern und Freigabe entfernen — die Regel (Admin oder Teilende*r) und die
 * Aufrufe sind dieselben wie im Web; der Server prüft sie noch einmal.
 */
export function useShareItemActions(
  groupId: string | null,
  isAdmin: boolean | null | undefined
): ShareItemActions {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { mutate: removeContent } = useRemoveGroupContent(groupId);
  const { mutate: setWrite } = useSetGroupContentWrite(groupId);

  return useMemo(() => {
    const fail = (error: Error) => useNoticeStore.getState().show('error', error.message);
    const done = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return {
      actionsFor: (item) => buildShareActions(item, canManageShare(item, isAdmin, userId)),
      run: (item, id) => {
        const action = id as ShareMenuId;
        if (action === 'write' || action === 'read') {
          const write = action === 'write';
          if (write === item.projectWrite) return;
          setWrite({ contentId: item.id, write }, { onSuccess: done, onError: fail });
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
  }, [isAdmin, userId, removeContent, setWrite]);
}
