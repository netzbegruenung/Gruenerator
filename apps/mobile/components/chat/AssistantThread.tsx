import { ThreadPrimitive, useAui } from '@assistant-ui/react-native';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, type TextInput, StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme';

import { AssistantComposer, type ComposerAccessory } from './AssistantComposer';
import { DocumentBrowserSheet } from './DocumentBrowserSheet';
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
  /** Icon shown above the greeting — e.g. the notebook's own icon. */
  icon?: IoniconsIconName;
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
  // One calm, centered greeting — no suggestion chips. The notebook passes its own
  // icon; the main chat falls back to the brand spark.
  const icon: IoniconsIconName = welcome?.icon ?? 'sparkles';
  const title = welcome?.title ?? 'Was möchtest du wissen?';
  const subtitle = welcome?.subtitle;

  return (
    <View style={styles.emptyContainer} pointerEvents="none">
      <Ionicons name={icon} size={48} color={theme.textGreen} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
});

const messagesContentStyle = { paddingTop: spacing.small };

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
  const aui = useAui();
  const composerInputRef = useRef<TextInput>(null);
  const [docBrowserVisible, setDocBrowserVisible] = useState(false);

  const messageComponents = useMemo(() => ({ Message: MessageBubble }), []);

  const handleOpenDocBrowser = useCallback(() => setDocBrowserVisible(true), []);

  const handleDocumentSelect = useCallback(
    (slug: string) => {
      const mentionText = `@datei:${slug} `;
      const currentText = aui.composer().getState().text;
      const separator = currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '';
      const newText = `${currentText}${separator}${mentionText}`;
      aui.composer().setText(newText);
      composerInputRef.current?.setNativeProps({ text: newText });
      setDocBrowserVisible(false);
    },
    [aui]
  );

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
        <AssistantComposer
          theme={theme}
          bottomInset={insets.bottom}
          onOpenDocBrowser={handleOpenDocBrowser}
          inputRef={composerInputRef}
          accessory={composerAccessory}
          transparent={transparent}
        />
        <DocumentBrowserSheet
          visible={docBrowserVisible}
          theme={theme}
          onSelect={handleDocumentSelect}
          onDismiss={() => setDocBrowserVisible(false)}
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
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
    gap: spacing.medium,
  },
  emptyTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 26,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
