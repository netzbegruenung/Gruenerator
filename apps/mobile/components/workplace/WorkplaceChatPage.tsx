import { type CreateAttachment } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTabSwipe } from '../../hooks/useTabSwipe';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { routeWithParams } from '../../types/routes';
import { mobileGreeting } from '../../utils/greeting';
import { BottomComposerBar } from '../common/BottomComposerBar';
import { CenteredGreeting } from '../common/CenteredGreeting';

/**
 * The Chat page of the workplace pager (`WorkplacePager`): the greeting in the middle and the
 * composer docked at the bottom, where the thread's composer sits — sending
 * here and replying in the thread happen in the same place.
 *
 * The composer starts a conversation rather than posting into one, so a picked
 * file is queued and the new thread's composer picks it up on mount.
 *
 * On Android a right drag opens the thread drawer: this is the first page, so
 * the pager has nothing that way, and the swipe claims rightward drags only —
 * leftward ones stay the pager's. On iOS the pager itself does this (its
 * overdrag, see `WorkplacePager`), because its scroll view would never let this
 * swipe start.
 */
export function WorkplaceChatPage() {
  const router = useRouter();
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const greeting = mobileGreeting(locale, firstName);

  const handleAttach = useCallback(
    (attachment: CreateAttachment) => {
      usePendingAttachmentStore.getState().add(attachment);
      router.push(routeWithParams('/(focused)/chat-conversation', { threadId: 'new' }));
    },
    [router]
  );

  const handleSend = useCallback(
    (text: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialMessage: text,
        })
      );
    },
    [router]
  );

  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const swipe = useTabSwipe({
    ...(Platform.OS === 'android' && { onSwipeRight: openDrawer }),
  });

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.flex}>
        <CenteredGreeting title={greeting} />
        <BottomComposerBar
          placeholder="Frage oder Aufgabe…"
          onSend={handleSend}
          showActionSheet
          onAttach={handleAttach}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
