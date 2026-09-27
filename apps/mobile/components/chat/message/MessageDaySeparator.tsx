import { useAuiState } from '@assistant-ui/react-native';
import { buildDaySeparatorLabels, type DatedEntry } from '@gruenerator/chat';
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { spacing, chatType } from '../../../theme';

/**
 * One O(N) pass per messages-array identity, shared by every separator in the
 * thread. Without the cache each instance ran its own scan on every thread
 * update — O(N²) across a streamed answer, since each token publishes a new
 * array to all subscribers. Same reason web keeps one.
 */
const labelCache = new WeakMap<readonly DatedEntry[], Map<string, string | null>>();

function separatorLabelsFor(messages: readonly DatedEntry[]): Map<string, string | null> {
  let labels = labelCache.get(messages);
  if (!labels) {
    labels = buildDaySeparatorLabels(messages, new Date());
    labelCache.set(messages, labels);
  }
  return labels;
}

/**
 * Rule with a day label above a message whose calendar day differs from the
 * previous message's — native counterpart of web's MessageDaySeparator, sharing
 * its label logic rather than restating it.
 *
 * The very first message only gets one when its day is NOT today: a lone "Heute"
 * over a fresh chat says nothing.
 */
export const MessageDaySeparator = memo(function MessageDaySeparator() {
  const theme = useTheme();
  const label = useAuiState((s) => separatorLabelsFor(s.thread.messages).get(s.message.id) ?? null);

  if (!label) return null;

  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={label}>
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    ...chatType.chatMeta,
    fontVariant: ['tabular-nums'],
  },
});
