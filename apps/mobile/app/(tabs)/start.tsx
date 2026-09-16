import { type CreateAttachment } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  KeyboardAvoidingView,
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Composer } from '../../components/common/Composer';
import { ContentColumn } from '../../components/common/ContentColumn';
import { SunriseBackground } from '../../components/common/SunriseBackground';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { ALL_TOOLS } from '../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../components/tools/ToolSquareGrid';
import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useLayout } from '../../hooks/useLayout';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { useTabNavigationSwipe } from '../../hooks/useTabSwipe';
import { usePendingAttachmentStore } from '../../stores/pendingAttachmentStore';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, lightTheme, darkTheme, typeScale } from '../../theme';
import { COMPOSER_BOTTOM_INSET_RAISED, collapsingSection, dockingSpacer } from '../../theme/layout';
import { route, routeWithParams } from '../../types/routes';
import { mobileGreeting } from '../../utils/greeting';

/**
 * Where the block sits on a tablet, as a share of the window height. Its own
 * middle then lands at roughly 28% — the optical centre, which is above the
 * geometric one.
 */
const TABLET_TOP_ANCHOR = 0.18;

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const greeting = mobileGreeting(locale, firstName);

  const bottomClearance = useTabBarClearance(spacing.medium);

  const { isTablet, height, contentWidth } = useLayout();
  // Centring is right on a phone, where the block fills most of the screen. On a
  // tablet it leaves ~545dp of nothing above and the same below, and the greeting
  // reads as having drifted rather than as having been placed. Anchoring near a
  // fifth from the top puts the block's own middle at roughly 28% — the optical
  // centre, which sits above the geometric one. On a phone the spacer above the
  // block grows like the one below it, which is what centres it; on a tablet it
  // is the fixed anchor, and the block stays put with the keyboard up too — the
  // keyboard never reaches it there.
  const topSpacer = useMemo(
    () => (isTablet ? { height: Math.round(height * TABLET_TOP_ANCHOR) } : styles.grow),
    [isTablet, height]
  );

  // With the keyboard up the block docks onto it like the thread's composer: the
  // spacer below stops growing and shrinks to the seam the thread keeps, so it
  // moves with the keys instead of jumping after them. Both ends are computed
  // here as numbers — a worklet may capture numbers, it may not call
  // `typeScale`. `height` runs negative while the keyboard is up.
  const raisedPad = typeScale(COMPOSER_BOTTOM_INSET_RAISED);
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomSpacer = useAnimatedStyle(() =>
    dockingSpacer(
      keyboard.progress.value,
      Math.abs(keyboard.height.value),
      bottomClearance,
      raisedPad
    )
  );

  // The favourites sit under the composer, so on a phone they would be what
  // touches the keyboard, and they fold away with it. Not on a tablet: nothing
  // docks there (see above), so folding them would clear a screen that has room
  // for them and leave a gap. The inner view is the one measured — a view with
  // an animated height no longer reports its natural one.
  const toolsHeight = useSharedValue(0);
  const toolsFold = useAnimatedStyle(() =>
    collapsingSection(isTablet ? 0 : keyboard.progress.value, toolsHeight.value)
  );
  // Clipped to nothing is invisible, not gone: without this a screen reader
  // still walks the tiles and a tap can still reach them. One re-render per
  // keyboard transition, not per frame — the fold itself stays on the UI thread.
  const toolsFolded = useKeyboardState((state) => state.isVisible) && !isTablet;

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
              greeting floating alone in the middle of an empty screen. With
              the keyboard up the block docks onto it, like the thread. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.flex}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={topSpacer} />
              {/* The column is what stops the composer from running the whole
                  width of an iPad. Its padding is the screen edge, so the
                  sections inside carry none of their own. */}
              <ContentColumn>
                {/* The greeting alone. The "wie kann ich dir helfen?" line below
                    it was web's, where the composer sits further away; here it
                    stands directly under the greeting and asks the same thing. */}
                <View style={styles.welcomeSection}>
                  <Text
                    style={[
                      styles.welcomeText,
                      isTablet && styles.welcomeTextWide,
                      { color: theme.text },
                    ]}
                  >
                    {greeting}
                  </Text>
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
                  <Animated.View
                    style={[styles.fold, toolsFold]}
                    pointerEvents={toolsFolded ? 'none' : 'auto'}
                    accessibilityElementsHidden={toolsFolded}
                    importantForAccessibility={toolsFolded ? 'no-hide-descendants' : 'auto'}
                  >
                    <View
                      style={styles.section}
                      // Only ever a real measurement: a 0 would be kept by the
                      // animated style (a key that vanishes is not reset, the
                      // last value sticks) and clip the section away for good.
                      // `.set` rather than `.value =` — the latter trips
                      // react-hooks/immutability inside a callback.
                      onLayout={(event) => {
                        const measured = event.nativeEvent.layout.height;
                        if (measured > 0) toolsHeight.set(measured);
                      }}
                    >
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
                      <ToolSquareGrid tools={favoriteTools} availableWidth={contentWidth} />
                    </View>
                  </Animated.View>
                )}
              </ContentColumn>
              <Animated.View style={bottomSpacer} />
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
  // Centring comes from the two spacers around the column, not from
  // `justifyContent`: the lower one is what docks the block on the keyboard, and
  // flex-grow would win over justify-content anyway.
  scrollContent: {
    flexGrow: 1,
  },
  grow: {
    flexGrow: 1,
  },
  fold: {
    overflow: 'hidden',
  },
  // The block is centred, the text inside it stays left-aligned. On one line the
  // two look identical; it matters when a long name wraps the greeting, where
  // the lines keep one shared left edge instead of each centring on its own.
  // Flush at the screen edge the heading read as hugging the left, because the
  // composer's own text starts ~74dp in — the heading was the only thing on the
  // screen touching the margin. Wrapped, the block fills the width and this
  // degrades to flush.
  welcomeSection: {
    paddingVertical: spacing.small,
    alignItems: 'center',
  },
  // Web sets the greeting off from the pill by `mb-lg`. Horizontally both sit in
  // the same ContentColumn, so they share an edge without either naming it.
  composerSlot: {
    paddingTop: spacing.small,
  },
  welcomeText: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  // A step, not a scaling. Once the column is capped the greeting no longer has
  // to fill the window, and a tablet is held further away — 28 read small over
  // 704dp of column, 40 would read as a poster.
  welcomeTextWide: {
    fontSize: 32,
  },
  section: {
    paddingTop: spacing.xlarge,
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
