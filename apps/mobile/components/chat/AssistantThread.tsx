import {
  ThreadRoot,
  ThreadMessages,
  ThreadEmpty,
  useAui,
  type ThreadMessage,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, lightTheme, darkTheme } from '../../theme';

import { AssistantComposer } from './AssistantComposer';
import { DocumentBrowserSheet } from './DocumentBrowserSheet';
import { MessageBubble } from './MessageBubble';

import type { Theme } from '../../theme/colors';

interface Props {
  theme?: Theme;
}

const EmptyState = memo(function EmptyState({ theme }: { theme: Theme }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Neue Unterhaltung</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Stelle eine Frage oder wähle einen Vorschlag
      </Text>
    </View>
  );
});

const messagesContentStyle = { paddingTop: spacing.small };

export const AssistantThread = memo(function AssistantThread({ theme: themeProp }: Props) {
  const colorScheme = useColorScheme();
  const theme: Theme = themeProp ?? (colorScheme === 'dark' ? darkTheme : lightTheme);
  const insets = useSafeAreaInsets();
  const aui = useAui();
  const [docBrowserVisible, setDocBrowserVisible] = useState(false);

  const renderMessage = useCallback(
    ({ message }: { message: ThreadMessage }) => <MessageBubble theme={theme} message={message} />,
    [theme]
  );

  const handleOpenDocBrowser = useCallback(() => setDocBrowserVisible(true), []);

  const handleDocumentSelect = useCallback(
    (slug: string) => {
      const mentionText = `@datei:${slug} `;
      const currentText = aui.composer().getState().text;
      const separator = currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '';
      aui.composer().setText(`${currentText}${separator}${mentionText}`);
      setDocBrowserVisible(false);
    },
    [aui]
  );

  return (
    <ThreadRoot style={[styles.container, { backgroundColor: theme.background }]}>
      <ThreadEmpty>
        <EmptyState theme={theme} />
      </ThreadEmpty>
      <ThreadMessages
        renderMessage={renderMessage}
        inverted
        contentContainerStyle={messagesContentStyle}
        keyboardDismissMode="interactive"
      />
      <AssistantComposer
        theme={theme}
        bottomInset={insets.bottom}
        onOpenDocBrowser={handleOpenDocBrowser}
      />
      <DocumentBrowserSheet
        visible={docBrowserVisible}
        theme={theme}
        onSelect={handleDocumentSelect}
        onDismiss={() => setDocBrowserVisible(false)}
      />
    </ThreadRoot>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
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
});
