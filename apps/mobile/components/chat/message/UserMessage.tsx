import { ActionBarPrimitive, MessagePrimitive } from '@assistant-ui/react-native';
import { parseMentionTokens } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { colors, spacing, borderRadius, chatType } from '../../../theme';
import { MessageAttachmentUI } from '../AttachmentUI';

import { BranchPicker } from './BranchPicker';
import { messageLayout } from './messageLayout';

/** Durable mention tokens (@[Label](type:id)) render as chips; plain text passes through. */
function UserBubbleText({ text }: { text: string }) {
  const tokens = parseMentionTokens(text);
  if (tokens.length === 0) return <Text style={styles.text}>{text}</Text>;
  const runs: ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const start = token.index;
    if (start > cursor) runs.push(text.slice(cursor, start));
    runs.push(
      <Text key={`${start}-${token.id}`} style={styles.mentionChip}>
        {`@${token.label}`}
      </Text>
    );
    cursor = start + token.raw.length;
  }
  if (cursor < text.length) runs.push(text.slice(cursor));
  return <Text style={styles.text}>{runs}</Text>;
}

/** Module-level so the memoized primitive sees a stable children reference. */
const renderAttachment = () => <MessageAttachmentUI />;

export const UserMessage = memo(function UserMessage() {
  const theme = useTheme();
  return (
    <MessagePrimitive.Root style={[messageLayout.row, messageLayout.userRow]}>
      <View style={[styles.bubble, styles.bubbleWidth, styles.bubbleFill]}>
        <MessagePrimitive.Attachments>{renderAttachment}</MessagePrimitive.Attachments>
        <MessagePrimitive.Content renderText={({ part }) => <UserBubbleText text={part.text} />} />
      </View>
      <View style={styles.actionBar}>
        <BranchPicker theme={theme} />
        <ActionBarPrimitive.Edit
          style={styles.editButton}
          accessibilityLabel="Nachricht bearbeiten"
        >
          <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
        </ActionBarPrimitive.Edit>
      </View>
    </MessagePrimitive.Root>
  );
});

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
  },
  bubbleWidth: {
    maxWidth: '85%',
  },
  bubbleFill: {
    backgroundColor: colors.eucalyptus,
    borderBottomRightRadius: borderRadius.small,
  },
  text: {
    ...chatType.chatBody,
    color: colors.white,
  },
  mentionChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 4,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xxsmall,
    // Same optical pull-in as the assistant row, mirrored to the right edge.
    marginRight: -7,
  },
  editButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
