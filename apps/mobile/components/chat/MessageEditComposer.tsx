import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react-native';
import { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

import { flagEditResubmit } from './message/threadRunSignals';

/**
 * The edit surface for a sent message, shown in place of the bubble while
 * `message.composer.isEditing` holds.
 *
 * Input and Cancel need no wiring: inside a message scope `aui.composer`
 * resolves to that message's edit composer rather than the thread composer, so
 * they already act on the right one. Sending forks the conversation at this
 * message — the branch picker beside the edit button is what makes the previous
 * version reachable again.
 *
 * Send is the exception. It has to flag the run as an edit-resubmit *before*
 * handing over, and `ComposerPrimitive.Send` takes no `onPress`
 * (`Omit<PressableProps, "onPress">`) — so this calls the same
 * `aui.composer.send()` the primitive would, one step later. `canSend` is the
 * primitive's own gate, kept so an empty edit still cannot be submitted.
 */
export const MessageEditComposer = memo(function MessageEditComposer() {
  const theme = useTheme();
  const aui = useAui();
  const messageId = useAuiState((s) => s.message.id);
  const canSend = useAuiState((s) => s.composer.canSend);

  const handleSend = useCallback(() => {
    flagEditResubmit(messageId);
    aui.composer.send();
  }, [aui, messageId]);

  return (
    <ComposerPrimitive.Root
      style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <ComposerPrimitive.Input
        multiline
        autoFocus
        testID="chat-edit-input"
        placeholder="Nachricht bearbeiten"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
      />
      <View style={styles.actions}>
        <ComposerPrimitive.Cancel
          testID="chat-edit-cancel"
          style={[styles.button, { borderColor: theme.border }]}
        >
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Abbrechen</Text>
        </ComposerPrimitive.Cancel>
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          testID="chat-edit-send"
          accessibilityRole="button"
          accessibilityLabel="Bearbeitete Nachricht senden"
          style={[styles.button, styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          <Text style={[styles.buttonText, styles.sendButtonText]}>Senden</Text>
        </Pressable>
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.white,
  },
});
