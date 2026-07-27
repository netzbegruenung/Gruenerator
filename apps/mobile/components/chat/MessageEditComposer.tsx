import { ComposerPrimitive } from '@assistant-ui/react-native';
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

/**
 * The edit surface for a sent message, shown in place of the bubble while
 * `message.composer.isEditing` holds.
 *
 * The composer primitives need no wiring here: inside a message scope
 * `aui.composer()` resolves to that message's edit composer rather than the
 * thread composer, so Input/Send/Cancel already act on the right one. Sending
 * forks the conversation at this message — the branch picker beside the edit
 * button is what makes the previous version reachable again.
 */
export const MessageEditComposer = memo(function MessageEditComposer() {
  const theme = useTheme();

  return (
    <ComposerPrimitive.Root
      style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <ComposerPrimitive.Input
        multiline
        autoFocus
        placeholder="Nachricht bearbeiten"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
      />
      <View style={styles.actions}>
        <ComposerPrimitive.Cancel style={[styles.button, { borderColor: theme.border }]}>
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Abbrechen</Text>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send style={[styles.button, styles.sendButton]}>
          <Text style={[styles.buttonText, styles.sendButtonText]}>Senden</Text>
        </ComposerPrimitive.Send>
      </View>
    </ComposerPrimitive.Root>
  );
});

const styles = StyleSheet.create({
  root: {
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    padding: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.large,
    gap: spacing.small,
  },
  input: {
    ...chatType.chatBody,
    // Room for a couple of lines without the sheet jumping on every keystroke.
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xsmall,
  },
  button: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonText: {
    ...chatType.chatTitle,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: colors.primary[600],
  },
  sendButtonText: {
    color: colors.white,
  },
});
