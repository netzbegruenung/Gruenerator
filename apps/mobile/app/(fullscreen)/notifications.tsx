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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifications, type AppNotification } from '../../hooks/useNotifications';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  document_shared: 'document-text-outline',
  document_permission_changed: 'shield-outline',
  document_access_revoked: 'lock-closed-outline',
  board_updates: 'grid-outline',
  group_activity: 'people-outline',
  group_member_joined: 'person-add-outline',
  group_role_changed: 'swap-horizontal-outline',
  group_content_shared: 'share-outline',
  group_deleted: 'trash-outline',
  wolke_setup: 'cloud-outline',
  pushed_content: 'phone-portrait-outline',
};

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

export default function NotificationsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const {
    notifications,
    isLoading,
    isLoadingMore,
    hasMore,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotifications();

  const handlePress = useCallback(
    (notification: AppNotification) => {
      if (!notification.is_read) markAsRead(notification.id);
      if (notification.action_url) {
        try {
          router.push(notification.action_url as never);
        } catch {}
      }
    },
    [markAsRead, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => {
      const icon = TYPE_ICONS[item.type] || 'notifications-outline';
      return (
        <TouchableOpacity
          style={[
            styles.item,
            {
              backgroundColor: item.is_read ? 'transparent' : (colorScheme === 'dark' ? colors.primary[900] + '30' : colors.primary[50]),
              borderBottomColor: theme.border,
            },
          ]}
          onPress={() => handlePress(item)}
          activeOpacity={0.6}
        >
          <View style={[styles.iconCircle, { backgroundColor: colorScheme === 'dark' ? colors.grey[800] : colors.grey[100] }]}>
            <Ionicons name={icon} size={18} color={colors.primary[600]} />
          </View>
          <View style={styles.itemContent}>
            <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.body && (
              <Text style={[styles.itemBody, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.body}
              </Text>
            )}
            <Text style={[styles.itemTime, { color: theme.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => dismiss(item.id)}
            hitSlop={8}
            style={styles.dismissBtn}
          >
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [colorScheme, theme, handlePress, dismiss]
  );

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Benachrichtigungen</Text>
        {hasUnread ? (
          <TouchableOpacity onPress={markAllAsRead} hitSlop={8}>
            <Text style={[styles.readAllText, { color: colors.primary[600] }]}>Alle gelesen</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary[600]} />
        }
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary[600]} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Keine Benachrichtigungen
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
  readAllText: { fontSize: 14, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.small,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemContent: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemBody: { fontSize: 13, lineHeight: 18 },
  itemTime: { fontSize: 11, marginTop: 2 },
  dismissBtn: { paddingTop: 4 },
  footer: { paddingVertical: spacing.large, alignItems: 'center' },
  empty: { paddingTop: 80, alignItems: 'center', gap: spacing.small },
  emptyText: { fontSize: 15 },
});
