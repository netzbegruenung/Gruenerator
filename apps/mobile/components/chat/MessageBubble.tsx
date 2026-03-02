import {
  MessageRoot,
  MessageContent,
  MessageIf,
  type ThreadMessage,
} from '@assistant-ui/react-native';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { colors, spacing, borderRadius } from '../../theme';

import { CitationsFooter } from './CitationsFooter';
import { ToolCallProgress } from './ToolCallProgress';

import type { Theme } from '../../theme/colors';
import type { GrueneratorMessageMetadata } from '@gruenerator/chat';

interface Props {
  theme: Theme;
  message: ThreadMessage;
}

function UserMessage({ theme }: { theme: Theme }) {
  return (
    <MessageIf user>
      <MessageRoot style={[styles.messageRow, styles.userRow]}>
        <View style={[styles.bubble, styles.userBubble]}>
          <MessageContent
            renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>}
          />
        </View>
      </MessageRoot>
    </MessageIf>
  );
}

function AssistantMessage({ theme, message }: Props) {
  const metadata = ((message.metadata as Record<string, unknown>)?.custom ??
    {}) as GrueneratorMessageMetadata;
  const citations = metadata.citations;

  const markdownStyles = getMarkdownStyles(theme);

  return (
    <MessageIf assistant>
      <MessageRoot style={[styles.messageRow, styles.assistantRow]}>
        <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: theme.surface }]}>
          <MessageContent
            renderText={({ part }) => <Markdown style={markdownStyles}>{part.text}</Markdown>}
            renderToolCall={({ part }) => <ToolCallProgress part={part} theme={theme} />}
            renderSource={() => <></>}
          />
          {citations && citations.length > 0 && (
            <CitationsFooter citations={citations} theme={theme} />
          )}
        </View>
      </MessageRoot>
    </MessageIf>
  );
}

export function MessageBubble({ theme, message }: Props) {
  return (
    <>
      <UserMessage theme={theme} />
      <AssistantMessage theme={theme} message={message} />
    </>
  );
}

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
