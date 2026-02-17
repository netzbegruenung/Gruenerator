import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Thread } from '../../services/chatThreads';
import type { lightTheme, darkTheme } from '../../theme/colors';

interface Props {
  thread: Thread;
  theme: typeof lightTheme | typeof darkTheme;
  onPress: () => void;
  onDelete: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `Vor ${diffMins} Min.`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Vor ${diffHours} Std.`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;

  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  });
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
      onPress={onPress}
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
        onPress={onDelete}
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
