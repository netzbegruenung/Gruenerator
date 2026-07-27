import { MessagePrimitive, useAui, useAuiState } from '@assistant-ui/react-native';
import { parseMentionTokens } from '@gruenerator/shared/utils';
import { memo, useCallback, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../../theme';
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
  const aui = useAui();
  const isEditing = useAuiState((s) => s.composer.isEditing);

  // Long-press the bubble to edit — there is no pencil beside it any more. This
  // is what `ActionBarPrimitive.Edit` did (`useActionBarEdit` is two lines:
  // `aui.composer().beginEdit()`, disabled while already editing); inside a
  // message scope `aui.composer()` is that message's edit composer, not the
  // thread's. Same gesture as the thread rows in the drawer, so "hold to act on
  // this thing" means one thing across the app.
  const handleLongPress = useCallback(() => {
    if (isEditing) return;
    aui.composer().beginEdit();
  }, [aui, isEditing]);

  return (
    <MessagePrimitive.Root style={[messageLayout.row, messageLayout.userRow]}>
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={350}
        testID="chat-message-edit"
        accessibilityLabel="Nachricht bearbeiten"
        style={({ pressed }) => [
          styles.bubble,
          styles.bubbleWidth,
          styles.bubbleFill,
          pressed && styles.bubblePressed,
        ]}
      >
        <MessagePrimitive.Attachments>{renderAttachment}</MessagePrimitive.Attachments>
        <MessagePrimitive.Content renderText={({ part }) => <UserBubbleText text={part.text} />} />
      </Pressable>
      <View style={styles.actionBar}>
        <BranchPicker theme={theme} />
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
  // The only feedback that the bubble is now something you can hold.
  bubblePressed: {
    opacity: 0.85,
  },
  text: {
    ...chatType.chatBody,
    color: colors.white,
    fontFamily: BODY_FONT,
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
});
