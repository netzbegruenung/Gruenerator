import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, useColorScheme, Pressable } from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createChatRenderers,
  CURRENT_USER,
  ThinkingStepIndicator,
  CitationsList,
} from '../../components/chat';
import { useDeepChatStore, toGiftedMessages } from '../../stores/deepChatStore';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';

export default function ChatConversationScreen() {
  const { threadId, initialMessage } = useLocalSearchParams<{
    threadId: string;
    initialMessage?: string;
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    messages,
    isStreaming,
    isLoadingMessages,
    streamingText,
    thinkingSteps,
    error,
    activeThreadId,
    sendMessage,
    cancelStream,
    switchThread,
    startNewChat,
  } = useDeepChatStore();

  const isNewChat = threadId === 'new';

  useEffect(() => {
    if (!isNewChat && threadId && threadId !== activeThreadId) {
      switchThread(threadId);
    }
  }, [threadId, isNewChat, activeThreadId, switchThread]);

  useEffect(() => {
    if (isNewChat && initialMessage) {
      sendMessage(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chatRenderers = useMemo(() => createChatRenderers(theme), [theme]);

  const giftedMessages = useMemo(
    () => toGiftedMessages(messages, streamingText, isStreaming),
    [messages, streamingText, isStreaming]
  );

  const handleSend = useCallback(
    (newMessages: IMessage[] = []) => {
      if (!newMessages.length) return;
      const text = newMessages[0].text.trim();
      if (!text) return;
      sendMessage(text);
    },
    [sendMessage]
  );

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations = lastAssistant?.citations;

  const headerTitle = isNewChat ? 'Neue Unterhaltung' : 'Chat';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
          {headerTitle}
        </Text>
        <View style={styles.headerButton}>
          {isStreaming ? (
            <Pressable onPress={cancelStream} hitSlop={12}>
              <Ionicons name="stop-circle" size={24} color={colors.error[500]} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {thinkingSteps.length > 0 && isStreaming && (
        <ThinkingStepIndicator steps={thinkingSteps} theme={theme} />
      )}

      <GiftedChat
        messages={giftedMessages}
        onSend={(msgs: IMessage[]) => handleSend(msgs)}
        user={CURRENT_USER}
        isTyping={isStreaming && !streamingText}
        alwaysShowSend
        placeholder="Nachricht eingeben..."
        {...chatRenderers}
        minInputToolbarHeight={60}
        bottomOffset={0}
        renderLoading={() => null}
      />

      {!isStreaming && citations && citations.length > 0 && (
        <CitationsList citations={citations} theme={theme} />
      )}
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
