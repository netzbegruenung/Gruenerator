import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, useColorScheme, Pressable, Text } from 'react-native';
import { GiftedChat, IMessage } from 'react-native-gifted-chat';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { FloatingGlassMenu, createChatRenderers, ASSISTANT_USER, CURRENT_USER } from '../../components/chat';
import { useChatStore } from '../../stores/chatStore';
import type { GrueneratorChatMessage } from '../../services/chat';

function toGiftedMessages(messages: GrueneratorChatMessage[]): IMessage[] {
  return messages
    .slice()
    .reverse()
    .map((msg) => ({
      _id: msg.id,
      text: msg.content,
      createdAt: new Date(msg.timestamp),
      user: msg.type === 'user' ? CURRENT_USER : ASSISTANT_USER,
      system: msg.type === 'error',
    }));
}

interface SourcesListProps {
  sources: Array<{ title: string; url: string; domain?: string }>;
  theme: typeof lightTheme | typeof darkTheme;
}

function SourcesList({ sources, theme }: SourcesListProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <View style={[styles.sourcesList, { borderTopColor: theme.border }]}>
      <Text style={[styles.sourcesLabel, { color: theme.textSecondary }]}>Quellen:</Text>
      {sources.slice(0, 3).map((source, index) => (
        <Text key={index} style={[styles.sourceItem, { color: theme.text }]} numberOfLines={1}>
          • {source.title || source.domain || source.url}
        </Text>
      ))}
    </View>
  );
}

interface ActionButtonsProps {
  actions: Array<{ label: string; value: string }>;
  onAction: (value: string) => void;
  theme: typeof lightTheme | typeof darkTheme;
}

function ActionButtons({ actions, onAction, theme }: ActionButtonsProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <View style={styles.actionsContainer}>
      {actions.map((action, index) => (
        <Pressable
          key={index}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: index === 0 ? colors.primary[600] : theme.surface,
              borderColor: colors.primary[600],
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={() => onAction(action.value)}
        >
          <Text
            style={[
              styles.actionButtonText,
              { color: index === 0 ? colors.white : colors.primary[600] },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function GrueneratorChatModal() {
  const router = useRouter();
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  const { messages, isLoading, sendMessage, clearMessages } = useChatStore();
  const [hasInitialMessageSent, setHasInitialMessageSent] = useState(false);

  const chatRenderers = useMemo(() => createChatRenderers(theme), [theme]);

  const giftedMessages = useMemo(() => toGiftedMessages(messages), [messages]);

  const latestMessage = messages[messages.length - 1];
  const showActions = latestMessage?.actions && latestMessage.actions.length > 0;
  const showSources = latestMessage?.sources && latestMessage.sources.length > 0;

  const handleSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!newMessages.length) return;
      const text = newMessages[0].text.trim();
      if (!text) return;

      await sendMessage(text);
    },
    [sendMessage]
  );

  const handleAction = useCallback(
    async (value: string) => {
      await sendMessage(value);
    },
    [sendMessage]
  );

  const handleClearChat = useCallback(async () => {
    await clearMessages();
  }, [clearMessages]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  if (initialMessage && !hasInitialMessageSent) {
    setHasInitialMessageSent(true);
    sendMessage(initialMessage);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <FloatingGlassMenu>
        <Pressable
          onPress={handleClearChat}
          style={({ pressed }) => [
            styles.floatingButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="trash-outline" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.floatingDivider} />
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.floatingButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="close" size={22} color={colors.primary[600]} />
        </Pressable>
      </FloatingGlassMenu>

      <View style={styles.contentContainer}>
        <GiftedChat
          messages={giftedMessages}
          onSend={(msgs: IMessage[]) => handleSend(msgs)}
          user={CURRENT_USER}
          isTyping={isLoading}
          alwaysShowSend
          placeholder="Nachricht eingeben..."
          {...chatRenderers}
          minInputToolbarHeight={60}
          bottomOffset={0}
        />

        {showSources && latestMessage.sources && (
          <SourcesList sources={latestMessage.sources} theme={theme} />
        )}

        {showActions && latestMessage.actions && (
          <ActionButtons
            actions={latestMessage.actions}
            onAction={handleAction}
            theme={theme}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    marginTop: spacing.xlarge + spacing.medium,
  },
  floatingButton: {
    padding: spacing.xsmall,
  },
  floatingDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    marginHorizontal: spacing.xxsmall,
  },
  sourcesList: {
    padding: spacing.medium,
    borderTopWidth: 1,
  },
  sourcesLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  sourceItem: {
    fontSize: 12,
    marginBottom: spacing.xxsmall,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    paddingBottom: spacing.large,
  },
  actionButton: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
