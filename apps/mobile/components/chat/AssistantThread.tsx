import { ThreadPrimitive } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { memo, useRef } from 'react';
import { View, Text, type TextInput, StyleSheet } from 'react-native';
import {
  KeyboardAvoidingView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { spacing, BODY_FONT, typeScale } from '../../theme';
import {
  COMPOSER_BOTTOM_INSET,
  COMPOSER_BOTTOM_INSET_RAISED,
  SCREEN_EDGE,
} from '../../theme/layout';
import { mobileGreeting } from '../../utils/greeting';
import { Composer, composerEdgeStyle, type ComposerAccessory } from '../common/Composer';

import { CompactionIndicator } from './CompactionIndicator';
import { MessageBubble } from './MessageBubble';

import type { Theme } from '../../theme/colors';

/**
 * Agent identity for the empty state. When omitted, the generic "Neue
 * Unterhaltung" + chatSuggestions screen is shown (main chat). When provided
 * (docs sidebar), the active agent's icon/title/description + opening questions
 * are surfaced — mirroring web's WelcomeScreen for `gruenerator-docs-editor`.
 */
export interface ThreadWelcome {
  title: string;
  subtitle?: string;
  suggestions: readonly string[];
}

interface Props {
  theme?: Theme;
  welcome?: ThreadWelcome;
  /**
   * Distance from the top of the screen to the top of this thread — the height of
   * any chrome above it (header, tabs, filter bar). KeyboardAvoidingView measures
   * its frame relative to its parent, not the screen, so when the thread is nested
   * below extra chrome (e.g. the notebook chat tab) this offset is needed to keep
   * the keyboard from overlapping the composer. 0 for the full-screen main chat.
   */
  keyboardVerticalOffset?: number;
  /** Optional composer toolbar button (e.g. the notebook chat's filter/mode sheet). */
  composerAccessory?: ComposerAccessory;
  /** Make the thread + composer backgrounds transparent so a screen-level
   *  background (e.g. the notebook gradient) shows through for full immersion. */
  transparent?: boolean;
}

const EmptyState = memo(function EmptyState({
  theme,
  welcome,
}: {
  theme: Theme;
  welcome?: ThreadWelcome;
}) {
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;

  // The same greeting the Chat tab opens with, set the same way — centred block,
  // left-aligned text, no icon plate. An empty thread and the tab are the same
  // moment; they used to look like two different products, which is why this
  // has to move whenever the tab does.
  const greeting = welcome?.title ?? mobileGreeting(locale ?? 'de-DE', firstName);
  // Only an agent brings a second line, and that line is its description. The
  // generic "wie kann ich dir helfen?" is gone: the composer sits right below
  // and asks it already.
  const subtitle = welcome?.subtitle ?? null;

  return (
    <View style={styles.emptyContainer} pointerEvents="none">
      <View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{greeting}</Text>
        {subtitle ? (
          // An agent's description — explanatory prose, which at the title's
          // 28/bold shouted over the question it is meant to support.
          <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
});

const messagesContentStyle = { paddingTop: spacing.small };

/**
 * Module-level so the memoized row sees a stable reference — the primitive
 * re-renders every row when this identity changes. `MessageBubble` picks its own
 * shape from message state, so the row needs nothing passed in.
 */
const renderMessage = () => <MessageBubble />;

export const AssistantThread = memo(function AssistantThread({
  theme: themeProp,
  welcome,
  keyboardVerticalOffset = 0,
  composerAccessory,
  transparent,
}: Props) {
  const resolvedTheme = useTheme();
  const theme: Theme = themeProp ?? resolvedTheme;
  const insets = useSafeAreaInsets();
  const composerInputRef = useRef<TextInput>(null);

  // Both ends computed here, on the JS thread, and only the interpolation runs
  // in the worklet. `typeScale` is an ordinary function from another module, so
  // calling it inside `useAnimatedStyle` makes it a remote call from the UI
  // runtime — which throws once per frame ("Tried to synchronously call a Remote
  // Function") and leaves the padding unset. Worklets may capture numbers; they
  // may not reach back for them.
  const restingPad = insets.bottom + typeScale(COMPOSER_BOTTOM_INSET);
  const raisedPad = typeScale(COMPOSER_BOTTOM_INSET_RAISED);

  // `progress` runs 0 → 1 with the keyboard, on the UI thread, so the padding
  // interpolates between the two resting values instead of jumping between them.
  const keyboard = useReanimatedKeyboardAnimation();
  const composerPadding = useAnimatedStyle(() => ({
    paddingBottom: restingPad + (raisedPad - restingPad) * keyboard.progress.value,
  }));

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.container}
    >
      <ThreadPrimitive.Root
        style={[
          styles.container,
          { backgroundColor: transparent ? 'transparent' : theme.background },
        ]}
      >
        <ThreadPrimitive.Empty>
          <EmptyState theme={theme} welcome={welcome} />
        </ThreadPrimitive.Empty>
        {/* Above the list rather than inside it, like web: the summary covers
            the whole thread, not one message. */}
        <CompactionIndicator theme={theme} />
        <ThreadPrimitive.Messages
          contentContainerStyle={messagesContentStyle}
          keyboardDismissMode="interactive"
        >
          {renderMessage}
        </ThreadPrimitive.Messages>
        {/* The bottom padding is animated rather than switched, because it is
            two different numbers and the change has to happen *with* the
            keyboard. Stepping it on `keyboardDidShow` would drop the composer
            22dp in one frame, halfway through the keyboard's own animation.
            See COMPOSER_BOTTOM_INSET for the two numbers. */}
        <Animated.View style={composerPadding}>
          <Composer
            binding="runtime"
            variant="bar"
            showActionSheet
            theme={theme}
            style={[
              composerEdgeStyle,
              { backgroundColor: transparent ? 'transparent' : theme.background },
            ]}
            testIDPrefix="chat-composer"
            inputRef={composerInputRef}
            accessory={composerAccessory}
          />
        </Animated.View>
      </ThreadPrimitive.Root>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // `alignItems: center` centres the BLOCK; the text inside keeps its left
  // edge. Same treatment as the Chat tab's hero — see the note there.
  emptyContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SCREEN_EDGE,
  },
  emptyTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  emptyDescription: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xsmall,
  },
});
