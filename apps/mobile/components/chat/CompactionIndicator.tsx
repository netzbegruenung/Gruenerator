import { useAgentStore } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { spacing, borderRadius, chatType } from '../../theme';

import type { Theme } from '../../theme/colors';

/**
 * Says that the older part of this conversation has been summarised, so a user
 * who scrolls up and finds nothing knows why. Reads the summary the store
 * already holds (`loadCompactionState`, run by the mobile runtime on thread
 * switch); renders nothing when there is none.
 *
 * Native counterpart of web's `CompactionIndicator`, which sits in the same
 * place — above the message list, below the empty state.
 */
export const CompactionIndicator = memo(function CompactionIndicator({ theme }: { theme: Theme }) {
  const summary = useAgentStore((s) => s.compactionState.summary);
  if (!summary) return null;

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="archive-outline" size={12} color={theme.textSecondary} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Älterer Verlauf zusammengefasst
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingVertical: spacing.xsmall,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.small,
    paddingVertical: 3,
  },
  label: {
    ...chatType.chatMeta,
  },
});
