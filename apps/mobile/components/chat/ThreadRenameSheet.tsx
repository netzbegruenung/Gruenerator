import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import { sanitizeThreadTitle } from './threadActionsView';

import type { Theme } from '../../theme/colors';

/**
 * Renaming a conversation, as a sheet.
 *
 * What used to be a whole action sheet here is now the platform's context menu
 * (see `menuActions.ts`) — but a menu cannot hold a text field, so this one
 * entry keeps a surface of its own. It opens *from* the menu rather than
 * replacing it.
 *
 * Inline rather than `Alert.prompt`, which exists only on iOS.
 */
export const ThreadRenameSheet = memo(function ThreadRenameSheet({
  visible,
  theme,
  title,
  onRename,
  onClose,
}: {
  visible: boolean;
  theme: Theme;
  title: string | undefined;
  onRename: (title: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');

  // Seed on open, not on mount: the host outlives any single opening, so a
  // conversation renamed elsewhere would otherwise come back with a stale draft.
  useEffect(() => {
    if (visible) setDraft(title ?? '');
  }, [visible, title]);

  const commit = useCallback(() => {
    const next = sanitizeThreadTitle(draft, title);
    if (next) onRename(next);
    onClose();
  }, [draft, title, onRename, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose} keyboardAvoiding>
      <View style={styles.renameBlock}>
        <Text style={[styles.heading, { color: theme.text }]}>Umbenennen</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={commit}
          placeholder="Titel der Unterhaltung"
          placeholderTextColor={theme.textSecondary}
          testID="thread-rename-input"
          style={[
            styles.renameInput,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        />
        <View style={styles.renameActions}>
          <Pressable onPress={onClose} style={styles.renameButton}>
            <Text style={[styles.renameButtonText, { color: theme.textSecondary }]}>Abbrechen</Text>
          </Pressable>
          <Pressable
            onPress={commit}
            testID="thread-rename-save"
            style={[styles.renameButton, styles.renameSave]}
          >
            <Text style={[styles.renameButtonText, styles.renameSaveText]}>Speichern</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  heading: {
    ...chatType.chatLabel,
    fontWeight: '600',
    paddingBottom: spacing.xsmall,
  },
  renameBlock: {
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
    gap: spacing.small,
  },
  renameInput: {
    ...chatType.chatBody,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xsmall,
  },
  renameButton: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  renameSave: {
    backgroundColor: colors.primary[600],
  },
  renameButtonText: {
    ...chatType.chatTitle,
    fontWeight: '600',
  },
  renameSaveText: {
    color: colors.white,
  },
});
