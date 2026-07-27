import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import { sanitizeThreadTitle } from './threadActionsView';

import type { Theme } from '../../theme/colors';

export interface ThreadActions {
  rename: (title: string) => void;
  archive: () => void;
  unarchive: () => void;
  delete: () => void;
}

function ActionRow({
  icon,
  label,
  theme,
  destructive,
  onPress,
}: {
  icon: IoniconsIconName;
  label: string;
  theme: Theme;
  destructive?: boolean;
  onPress: () => void;
}) {
  const color = destructive ? colors.semantic.error : theme.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surface : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * What you can do with one conversation. Replaces the long-press-to-delete that
 * was mobile's entire thread menu — deleting was reachable by accident and
 * nothing else was reachable at all.
 *
 * Renaming happens inline rather than through `Alert.prompt`, which exists only
 * on iOS. Deleting still confirms; the confirmation lives with the caller, next
 * to the conversation's title.
 *
 * Two entries from web are deliberately missing: **Tags**, which were just
 * removed from web's own menu, and **Zu Space hinzufügen**, which needs the
 * group picker as a full surface rather than a row. Pinning is missing for a
 * different reason — web persists pins in `localStorage`, so a mobile pin would
 * be device-local and disagree with the desktop. That needs a decision, not an
 * implementation.
 */
export const ThreadActionsSheet = memo(function ThreadActionsSheet({
  visible,
  theme,
  title,
  archived,
  actions,
  onClose,
  onShare,
  onDelete,
}: {
  visible: boolean;
  theme: Theme;
  title: string | undefined;
  archived: boolean;
  actions: ThreadActions;
  onClose: () => void;
  onShare: () => void;
  /** Confirmation lives with the caller, which knows the conversation's name. */
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const beginRename = useCallback(() => {
    setDraft(title ?? '');
    setRenaming(true);
  }, [title]);

  const commitRename = useCallback(() => {
    const next = sanitizeThreadTitle(draft, title);
    if (next) actions.rename(next);
    setRenaming(false);
    onClose();
  }, [draft, title, actions, onClose]);

  const close = useCallback(() => {
    setRenaming(false);
    onClose();
  }, [onClose]);

  return (
    <BottomSheet visible={visible} onClose={close} keyboardAvoiding>
      {renaming ? (
        <View style={styles.renameBlock}>
          <Text style={[styles.heading, { color: theme.text }]}>Umbenennen</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={commitRename}
            placeholder="Titel der Unterhaltung"
            placeholderTextColor={theme.textSecondary}
            testID="thread-rename-input"
            style={[
              styles.renameInput,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
            ]}
          />
          <View style={styles.renameActions}>
            <Pressable onPress={() => setRenaming(false)} style={styles.renameButton}>
              <Text style={[styles.renameButtonText, { color: theme.textSecondary }]}>
                Abbrechen
              </Text>
            </Pressable>
            <Pressable
              onPress={commitRename}
              testID="thread-rename-save"
              style={[styles.renameButton, styles.renameSave]}
            >
              <Text style={[styles.renameButtonText, styles.renameSaveText]}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={[styles.heading, { color: theme.textSecondary }]} numberOfLines={1}>
            {title || 'Neue Unterhaltung'}
          </Text>
          <ActionRow icon="pencil-outline" label="Umbenennen" theme={theme} onPress={beginRename} />
          <ActionRow
            icon="share-social-outline"
            label="Mit Gruppe teilen"
            theme={theme}
            onPress={() => {
              onClose();
              onShare();
            }}
          />
          {archived ? (
            <ActionRow
              icon="arrow-undo-outline"
              label="Wiederherstellen"
              theme={theme}
              onPress={() => {
                actions.unarchive();
                onClose();
              }}
            />
          ) : (
            <ActionRow
              icon="archive-outline"
              label="Archivieren"
              theme={theme}
              onPress={() => {
                actions.archive();
                onClose();
              }}
            />
          )}
          <ActionRow
            icon="trash-outline"
            label="Löschen"
            theme={theme}
            destructive
            onPress={() => {
              onClose();
              onDelete();
            }}
          />
        </View>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.small,
  },
  heading: {
    ...chatType.chatLabel,
    fontWeight: '600',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  rowLabel: {
    ...chatType.chatBody,
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
