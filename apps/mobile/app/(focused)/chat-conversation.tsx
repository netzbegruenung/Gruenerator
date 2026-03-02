import { useThreadIsRunning, useAssistantRuntime } from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, StyleSheet, useColorScheme, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantThread } from '../../components/chat';
import { MobileChatProvider } from '../../providers/MobileChatProvider';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';

function ChatHeader() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isRunning = useThreadIsRunning();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top,
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
        <Ionicons name="chevron-back" size={28} color={colors.primary[600]} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
        Chat
      </Text>
      <View style={styles.headerButton}>
        {isRunning && <ActivityIndicator size="small" color={colors.primary[600]} />}
      </View>
    </View>
  );
}

function InitialMessageSender({ message }: { message: string }) {
  const runtime = useAssistantRuntime();

  useEffect(() => {
    if (message) {
      runtime.thread.composer.setText(message);
      runtime.thread.composer.send();
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function ChatConversationScreen() {
  const { threadId, initialMessage } = useLocalSearchParams<{
    threadId: string;
    initialMessage?: string;
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const isNewChat = threadId === 'new';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MobileChatProvider threadId={isNewChat ? null : threadId}>
        <ChatHeader />
        <AssistantThread theme={theme} />
        {isNewChat && initialMessage && <InitialMessageSender message={initialMessage} />}
      </MobileChatProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xsmall,
    paddingBottom: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
});
