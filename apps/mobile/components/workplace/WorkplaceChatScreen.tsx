import { type CreateAttachment } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useLayout } from '../../hooks/useLayout';
import { useTabNavigationSwipe } from '../../hooks/useTabSwipe';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { darkTheme, lightTheme, spacing } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { mobileGreeting } from '../../utils/greeting';
import { BottomComposerBar } from '../common/BottomComposerBar';
import { SunriseBackground } from '../common/SunriseBackground';
import { ScreenScaffold } from '../navigation/ScreenScaffold';
import { WorkplaceTopTabs } from '../navigation/WorkplaceTopTabs';

/**
 * The Chat tab of the workplace shell: the greeting in the middle and the
 * composer docked at the bottom, where the thread's composer sits — sending
 * here and replying in the thread happen in the same place.
 *
 * The composer starts a conversation rather than posting into one, so a picked
 * file is queued and the new thread's composer picks it up on mount.
 */
export function WorkplaceChatScreen() {
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
  const swipe = useTabNavigationSwipe('/start', { onSwipeRightAtStart: openDrawer });

  return (
    <ScreenScaffold
      title="Chat"
      titleNode={<WorkplaceTopTabs active="chat" />}
      backdrop={<SunriseBackground />}
    >
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
    </ScreenScaffold>
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
