import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRecentThreads, type RecentThread } from '../../hooks/useRecentThreads';
import { getMobileChatApiClient } from '../../services/chatConfig';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';

function formatTimeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'jetzt';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateString).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

export default function AllThreadsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { threads, isLoading, refetch } = useRecentThreads(50);

  const handleDelete = useCallback(
    (threadId: string, title: string) => {
      Alert.alert('Unterhaltung löschen', `„${title}" wirklich löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = getMobileChatApiClient();
              await client.delete(`/api/chat-service/threads?threadId=${threadId}`);
              refetch();
            } catch {}
          },
        },
      ]);
    },
    [refetch]
  );

  const renderItem = useCallback(
    ({ item }: { item: RecentThread }) => (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: theme.border }]}
        onPress={() =>
          router.push(
            routeWithParams('/(focused)/chat-conversation', { threadId: item.id })
          )
        }
        onLongPress={() => handleDelete(item.id, item.title || 'Neue Unterhaltung')}
        activeOpacity={0.6}
      >
        <View style={[styles.iconCircle, { backgroundColor: colorScheme === 'dark' ? colors.grey[800] : colors.grey[100] }]}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.primary[600]} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {item.title || 'Neue Unterhaltung'}
          </Text>
          {item.lastMessage && (
            <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.lastMessage.content}
            </Text>
          )}
        </View>
        <Text style={[styles.time, { color: theme.textSecondary }]}>
          {formatTimeAgo(item.updatedAt)}
        </Text>
      </TouchableOpacity>
    ),
    [colorScheme, theme, router, handleDelete]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Unterhaltungen</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(
              routeWithParams('/(focused)/chat-conversation', { threadId: 'new' })
            )
          }
          hitSlop={8}
        >
          <Ionicons name="add" size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary[600]} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Noch keine Unterhaltungen
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.small,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '500' },
  preview: { fontSize: 13 },
  time: { fontSize: 12 },
  empty: { paddingTop: 80, alignItems: 'center', gap: spacing.small },
  emptyText: { fontSize: 15 },
});
