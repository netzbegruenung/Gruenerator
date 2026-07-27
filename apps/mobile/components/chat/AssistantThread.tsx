import { ThreadPrimitive } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { getGreeting } from '@gruenerator/shared/utils';
import { memo, useMemo, useRef } from 'react';
import { View, Text, type TextInput, StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme';
import { SCREEN_EDGE } from '../../theme/layout';
import { Composer, composerEdgeStyle, type ComposerAccessory } from '../common/Composer';

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

  // The same greeting the Chat tab opens with, set the same way — left-aligned,
  // no icon plate. An empty thread and the tab are the same moment; they used to
  // look like two different products.
  const greeting = welcome?.title ?? getGreeting(locale ?? 'de-DE', firstName);
  const subtitle =
    welcome?.subtitle ?? (greeting.includes('?') ? null : 'wie kann ich dir helfen?');

  return (
    <View style={styles.emptyContainer} pointerEvents="none">
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{greeting}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
});

const messagesContentStyle = { paddingTop: spacing.small };

/** The in-thread composer is snug rather than the landings' focal box, so the
 *  message list keeps the space. */
const THREAD_COMPOSER_MIN_HEIGHT = 92;

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

  const messageComponents = useMemo(() => ({ Message: MessageBubble }), []);

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
        <ThreadPrimitive.Messages
          components={messageComponents}
          contentContainerStyle={messagesContentStyle}
          keyboardDismissMode="interactive"
        />
        <Composer
          binding="runtime"
          showActionSheet
          minHeight={THREAD_COMPOSER_MIN_HEIGHT}
          theme={theme}
          style={[
            composerEdgeStyle,
            {
              backgroundColor: transparent ? 'transparent' : theme.background,
              paddingBottom: insets.bottom,
            },
          ]}
          testIDPrefix="chat-composer"
          inputRef={composerInputRef}
          accessory={composerAccessory}
        />
      </ThreadPrimitive.Root>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: SCREEN_EDGE,
  },
  emptyTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  emptySubtitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
    marginTop: 2,
  },
});
