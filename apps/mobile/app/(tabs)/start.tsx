import { type CreateAttachment } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView, Platform } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '../../components/common/Composer';
import { SunriseBackground } from '../../components/common/SunriseBackground';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { ALL_TOOLS } from '../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../components/tools/ToolSquareGrid';
import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTabNavigationSwipe } from '../../hooks/useTabSwipe';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, lightTheme, darkTheme } from '../../theme';
import { FLOATING_TAB_BAR_HEIGHT, SCREEN_EDGE } from '../../theme/layout';
import { route, routeWithParams } from '../../types/routes';
import { mobileGreeting } from '../../utils/greeting';

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const greeting = mobileGreeting(locale, firstName);

  const insets = useSafeAreaInsets();
  // The Android tab bar is absolutely positioned (ClassicTabLayout), so the
  // navigator reserves no room for it and the scroll content has to clear it
  // itself — the same sum BottomComposerBar used while it was pinned there.
  const bottomClearance =
    Platform.OS === 'ios'
      ? insets.bottom + spacing.medium
      : insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.medium;

  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const favoriteTools = ALL_TOOLS.filter((tool) => favorites.includes(tool.id));

  // This composer starts a conversation rather than posting into one, so a
  // picked file cannot be attached here — it is queued and the new thread's
  // composer picks it up on mount.
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

  // Chat is the first tab: swipe left walks the row, and swipe right has no
  // previous tab to reach, so it opens the drawer. That exception lives here and
  // nowhere else — the other three tabs swipe right to their neighbour.
  const swipe = useTabNavigationSwipe('/start', { onSwipeRightAtStart: openDrawer });

  return (
    <ScreenScaffold title="Grünerator" backdrop={<SunriseBackground />}>
      <GestureDetector gesture={swipe}>
        <View style={styles.flex}>
          {/* One centred block — greeting, composer, tools — the way web's
              ChatHero stacks WorkplaceGreeting over the pill composer. The
              composer used to be pinned to the bottom edge, which left the
              greeting floating alone in the middle of an empty screen. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.flex}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomClearance }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* The greeting alone. The "wie kann ich dir helfen?" line below it
                  was web's, where the composer sits further away; here it stands
                  directly under the greeting and asks the same thing. */}
              <View style={styles.welcomeSection}>
                <Text style={[styles.welcomeText, { color: theme.text }]}>{greeting}</Text>
              </View>

              <Composer
                variant="bar"
                testIDPrefix="tab-composer"
                style={styles.composerSlot}
                placeholder="Frage oder Aufgabe…"
                onSubmit={handleSend}
                showActionSheet
                onAttach={handleAttach}
              />

              {favoriteTools.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
                  <ToolSquareGrid tools={favoriteTools} horizontalPadding={SCREEN_EDGE * 2} />
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </GestureDetector>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // The block is centred, the text inside it stays left-aligned. On one line the
  // two look identical; it matters when a long name wraps the greeting, where
  // the lines keep one shared left edge instead of each centring on its own.
  // Flush at SCREEN_EDGE the heading read as hugging the left, because the
  // composer's own text starts ~74dp in — the heading was the only thing on the
  // screen touching the margin. Wrapped, the block fills the width and this
  // degrades to flush.
  welcomeSection: {
    paddingHorizontal: SCREEN_EDGE,
    paddingVertical: spacing.small,
    alignItems: 'center',
  },
  // Web sets the greeting off from the pill by `mb-lg`; SCREEN_EDGE horizontally
  // so the composer lines up with the greeting above it and the tool grid below.
  composerSlot: {
    paddingHorizontal: SCREEN_EDGE,
    paddingTop: spacing.small,
  },
  welcomeText: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  section: {
    paddingTop: spacing.xlarge,
    paddingHorizontal: SCREEN_EDGE,
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
