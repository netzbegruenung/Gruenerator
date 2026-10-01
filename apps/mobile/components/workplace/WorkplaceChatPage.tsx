import { type CreateAttachment } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useLayout } from '../../hooks/useLayout';
import { useTabSwipe } from '../../hooks/useTabSwipe';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { darkTheme, lightTheme, spacing } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { mobileGreeting } from '../../utils/greeting';
import { BottomComposerBar } from '../common/BottomComposerBar';

/**
 * The Chat page of the workplace pager (`WorkplacePager`): the greeting in the middle and the
 * composer docked at the bottom, where the thread's composer sits — sending
 * here and replying in the thread happen in the same place.
 *
 * The composer starts a conversation rather than posting into one, so a picked
 * file is queued and the new thread's composer picks it up on mount.
 *
 * A right drag opens the thread drawer: this is the first page, so the pager has
 * nothing that way, and the swipe claims rightward drags only — leftward ones
 * stay the pager's.
 */
export function WorkplaceChatPage() {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user, locale } = useAuth();
  const { isTablet } = useLayout();
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
  const swipe = useTabSwipe({ onSwipeRight: openDrawer });

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.flex}>
        <View style={styles.hero}>
          <Text style={[styles.greeting, isTablet && styles.greetingWide, { color: theme.text }]}>
            {greeting}
          </Text>
        </View>
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
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
  },
  greeting: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
    textAlign: 'center',
  },
  greetingWide: {
    fontSize: 32,
  },
});
