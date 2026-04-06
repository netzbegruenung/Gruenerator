import { Ionicons } from '@expo/vector-icons';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

interface ThreadItem {
  id: string;
  title: string | null;
  updatedAt: string;
  lastMessage?: { content: string; role: string; created_at: string } | null;
}

interface Props {
  thread: ThreadItem;
  theme: Theme;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ThreadListItem({ thread, theme, onPress, onDelete }: Props) {
  const preview = thread.lastMessage?.content || '';
  const time = formatRelativeTime(thread.updatedAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? theme.surface : theme.background,
          borderBottomColor: theme.border,
        },
      ]}
      onPress={() => onPress(thread.id)}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {thread.title || 'Neue Unterhaltung'}
          </Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{time}</Text>
        </View>
        {preview ? (
          <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}
        onPress={() => onDelete(thread.id)}
        hitSlop={8}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
    borderBottomWidth: 1,
  },
  content: {
    flex: 1,
    marginRight: spacing.small,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxsmall,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginRight: spacing.small,
  },
  time: {
    fontSize: 12,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteButton: {
    padding: spacing.xsmall,
  },
});
