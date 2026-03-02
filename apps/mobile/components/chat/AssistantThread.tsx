import {
  ThreadRoot,
  ThreadMessages,
  ThreadEmpty,
  type ThreadMessage,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, lightTheme, darkTheme } from '../../theme';

import { AssistantComposer } from './AssistantComposer';
import { MessageBubble } from './MessageBubble';

import type { Theme } from '../../theme/colors';

interface Props {
  theme?: Theme;
}

function EmptyState({ theme }: { theme: Theme }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Neue Unterhaltung</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Stelle eine Frage oder wähle einen Vorschlag
      </Text>
    </View>
  );
}

export function AssistantThread({ theme: themeProp }: Props) {
  const colorScheme = useColorScheme();
  const theme: Theme = themeProp ?? (colorScheme === 'dark' ? darkTheme : lightTheme);
  const insets = useSafeAreaInsets();

  const renderMessage = useCallback(
    ({ message }: { message: ThreadMessage }) => <MessageBubble theme={theme} message={message} />,
    [theme]
  );

  return (
    <ThreadRoot style={[styles.container, { backgroundColor: theme.background }]}>
      <ThreadEmpty>
        <EmptyState theme={theme} />
      </ThreadEmpty>
      <ThreadMessages
        renderMessage={renderMessage}
        inverted
        contentContainerStyle={{ paddingTop: spacing.small }}
        keyboardDismissMode="interactive"
      />
      <View style={{ paddingBottom: insets.bottom }}>
        <AssistantComposer theme={theme} />
      </View>
    </ThreadRoot>
  );
}

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
