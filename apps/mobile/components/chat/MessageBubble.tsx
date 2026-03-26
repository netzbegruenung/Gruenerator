import {
  MessagePrimitive,
  useAuiState,
} from '@assistant-ui/react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

import { MessageAttachmentUI } from './AttachmentUI';
import { CitationsFooter } from './CitationsFooter';
import { MessageActionsSheet } from './MessageActionsSheet';
import { ToolCallProgress } from './ToolCallProgress';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata } from '@gruenerator/chat';

function useResolvedTheme(): Theme {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export const UserMessageComponent = memo(function UserMessageComponent() {
  return (
    <MessagePrimitive.Root style={[styles.messageRow, styles.userRow]}>
      <View style={[styles.bubble, styles.userBubble]}>
        <MessagePrimitive.Attachments components={{ Attachment: MessageAttachmentUI }} />
        <MessagePrimitive.Content
          renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>}
        />
      </View>
    </MessagePrimitive.Root>
  );
});

export const AssistantMessageComponent = memo(function AssistantMessageComponent() {
  const theme = useResolvedTheme();
  const message = useAuiState((s) => s.message);
  const metadata = ((message.metadata as Record<string, unknown>)?.custom ??
    {}) as ChatMessageMetadata;
  const citations = metadata.citations;
  const [actionsVisible, setActionsVisible] = useState(false);

  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);

  const messageText = useMemo(() => {
    return message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }, [message.content]);

  const handleLongPress = useCallback(() => {
    if (messageText) setActionsVisible(true);
  }, [messageText]);

  return (
    <>
      <MessagePrimitive.Root style={[styles.messageRow, styles.assistantRow]}>
        <Pressable onLongPress={handleLongPress}>
          <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: theme.surface }]}>
            <MessagePrimitive.Content
              renderText={({ part }) => <Markdown style={markdownStyles}>{part.text}</Markdown>}
              renderToolCall={({ part }) => <ToolCallProgress part={part} theme={theme} />}
              renderSource={() => <></>}
            />
            {citations && citations.length > 0 && (
              <CitationsFooter citations={citations} theme={theme} />
            )}
          </View>
        </Pressable>
      </MessagePrimitive.Root>
      <MessageActionsSheet
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        message={messageText ? { role: 'assistant', text: messageText, metadata: metadata as Record<string, unknown> } : null}
      />
    </>
  );
});

export const MessageBubble = memo(function MessageBubble() {
  return (
    <>
      <MessagePrimitive.If user>
        <UserMessageComponent />
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <AssistantMessageComponent />
      </MessagePrimitive.If>
    </>
  );
});

function getMarkdownStyles(theme: Theme) {
  return {
    body: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700' as const,
      marginBottom: spacing.xsmall,
    },
    heading2: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '600' as const,
      marginBottom: spacing.xsmall,
    },
    heading3: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600' as const,
      marginBottom: spacing.xxsmall,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: spacing.xsmall,
    },
    link: {
      color: theme.link,
    },
    blockquote: {
      backgroundColor: theme.surface,
      borderLeftColor: colors.primary[600],
      borderLeftWidth: 3,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.xsmall,
    },
    code_inline: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: 13,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: 13,
      padding: spacing.small,
      borderRadius: borderRadius.medium,
    },
    list_item: {
      marginBottom: spacing.xxsmall,
    },
    strong: {
      fontWeight: '600' as const,
    },
  };
}

const styles = StyleSheet.create({
  messageRow: {
    paddingHorizontal: spacing.medium,
    marginVertical: spacing.xxsmall,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
  },
  userBubble: {
    backgroundColor: colors.primary[600],
    borderBottomRightRadius: borderRadius.small,
  },
  assistantBubble: {
    borderBottomLeftRadius: borderRadius.small,
  },
  userText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 22,
  },
});
