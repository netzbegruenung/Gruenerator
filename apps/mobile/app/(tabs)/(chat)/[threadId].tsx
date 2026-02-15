import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, useColorScheme, Pressable } from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createChatRenderers,
  CURRENT_USER,
  ThinkingStepIndicator,
  CitationsList,
} from '../../../components/chat';
import { useDeepChatStore, toGiftedMessages } from '../../../stores/deepChatStore';
import { colors, spacing, lightTheme, darkTheme } from '../../../theme';

export default function ChatConversationScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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

  // Load thread messages on mount (unless it's a new chat)
  useEffect(() => {
    if (!isNewChat && threadId && threadId !== activeThreadId) {
      switchThread(threadId);
    }
  }, [threadId, isNewChat, activeThreadId, switchThread]);

  // Handle initial message from params (suggestion chip)
  const params = useLocalSearchParams<{ initialMessage?: string }>();
  useEffect(() => {
    if (isNewChat && params.initialMessage) {
      sendMessage(params.initialMessage);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update header with cancel button during streaming
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isStreaming ? (
          <Pressable onPress={cancelStream} style={{ padding: spacing.xsmall }}>
            <Ionicons name="stop-circle" size={24} color={colors.error[500]} />
          </Pressable>
        ) : null,
    });
  }, [isStreaming, cancelStream, navigation]);

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

  // Get citations from the last assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations = lastAssistant?.citations;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
});
