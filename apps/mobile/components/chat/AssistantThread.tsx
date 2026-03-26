import {
  ThreadPrimitive,
  useAui,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatSuggestions } from '@gruenerator/chat';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, type TextInput, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

import { AssistantComposer } from './AssistantComposer';
import { DocumentBrowserSheet } from './DocumentBrowserSheet';
import { MessageBubble } from './MessageBubble';

import type { Theme } from '../../theme/colors';

interface Props {
  theme?: Theme;
}

const EmptyState = memo(function EmptyState({ theme }: { theme: Theme }) {
  const aui = useAui();

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Neue Unterhaltung</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Stelle eine Frage oder wähle einen Vorschlag
      </Text>
      <View style={styles.suggestionsGrid}>
        {chatSuggestions.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => aui.composer().setText(s.prompt)}
            style={[styles.suggestionChip, { borderColor: theme.border }]}
          >
            <Text style={[styles.suggestionTitle, { color: theme.text }]}>{s.title}</Text>
            <Text style={[styles.suggestionLabel, { color: theme.textSecondary }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const messagesContentStyle = { paddingTop: spacing.small };

export const AssistantThread = memo(function AssistantThread({ theme: themeProp }: Props) {
  const colorScheme = useColorScheme();
  const theme: Theme = themeProp ?? (colorScheme === 'dark' ? darkTheme : lightTheme);
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
    <KeyboardAvoidingView behavior="padding" style={styles.container}>
      <ThreadPrimitive.Root style={[styles.container, { backgroundColor: theme.background }]}>
        <ThreadPrimitive.Empty>
          <EmptyState theme={theme} />
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
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
    paddingTop: spacing.xlarge,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.medium,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xsmall,
    lineHeight: 20,
  },
  suggestionsGrid: {
    width: '100%',
    marginTop: spacing.large,
    gap: spacing.small,
  },
  suggestionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionLabel: {
    fontSize: 12,
    marginTop: 2,
  },
});
