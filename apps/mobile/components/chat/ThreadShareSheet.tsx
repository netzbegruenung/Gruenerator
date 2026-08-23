import { useThreadSharing } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { SkeletonRows } from '../common/Skeleton';

import { buildShareableGroups, type ShareableGroup } from './threadActionsView';

import type { Theme } from '../../theme/colors';

function GroupRow({
  group,
  theme,
  busy,
  onToggle,
}: {
  group: ShareableGroup;
  theme: Theme;
  busy: boolean;
  onToggle: (group: ShareableGroup) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(group)}
      disabled={busy}
      style={({ pressed }) => [
        styles.groupRow,
        { backgroundColor: pressed ? theme.surface : 'transparent', opacity: busy ? 0.5 : 1 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: group.isShared }}
      accessibilityLabel={group.name}
    >
      <Ionicons
        name={group.isShared ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={group.isShared ? colors.primary[500] : theme.textSecondary}
      />
      <Text style={[styles.groupName, { color: theme.text }]} numberOfLines={1}>
        {group.name}
      </Text>
    </Pressable>
  );
}

/**
 * Shares a conversation with the user's groups — the same group-level sharing
 * web offers, not a public link.
 *
 * Sharing is immediate on tap rather than collected behind a "Speichern": each
 * row is one call, and a half-applied batch is worse than a row that visibly
 * failed to flip.
 */
export const ThreadShareSheet = memo(function ThreadShareSheet({
  visible,
  threadId,
  theme,
  onClose,
}: {
  visible: boolean;
  threadId: string | null;
  theme: Theme;
  onClose: () => void;
}) {
  const { sharedGroups, userGroups, loading, shareWithGroup, unshare } = useThreadSharing(threadId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const groups = useMemo(
    () => buildShareableGroups(userGroups, sharedGroups),
    [userGroups, sharedGroups]
  );

  const handleToggle = useCallback(
    (group: ShareableGroup) => {
      setPendingId(group.id);
      const action = group.isShared ? unshare(group.id) : shareWithGroup(group.id);
      // The hook already reports failures; here the row simply stops being busy
      // and stays in its old state, which is the truth until the list refetches.
      void action.catch(() => undefined).finally(() => setPendingId(null));
    },
    [shareWithGroup, unshare]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="70%">
      <Text style={[styles.title, { color: theme.text }]}>Mit Gruppe teilen</Text>

      {loading ? (
        <SkeletonRows count={4} leading={36} meta={false} />
      ) : groups.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Du bist in keiner Gruppe. Gruppen findest du im Profil.
        </Text>
      ) : (
        <ScrollView>
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              theme={theme}
              busy={pendingId === group.id}
              onToggle={handleToggle}
            />
          ))}
        </ScrollView>
      )}
      <View style={styles.spacer} />
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  title: {
    ...chatType.chatBody,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  empty: {
    ...chatType.chatSecondary,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  groupName: {
    ...chatType.chatBody,
    flex: 1,
  },
  spacer: {
    height: spacing.small,
  },
});
