import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';


import { useNotifications, type AppNotification } from '../../hooks/useNotifications';
import { colors, spacing, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { actionUrlToRoute } from '../../utils/actionUrl';
import { SkeletonRows } from '../common/Skeleton';

const TYPE_ICONS: Record<string, IoniconsIconName> = {
  document_shared: 'document-text-outline',
  document_permission_changed: 'shield-outline',
  document_access_revoked: 'lock-closed-outline',
  board_updates: 'grid-outline',
  group_member_joined: 'person-add-outline',
  group_role_changed: 'swap-horizontal-outline',
  group_content_shared: 'share-outline',
  group_deleted: 'trash-outline',
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

interface Props {
  /** Called before navigating away (e.g. to close the containing dropdown). */
  onNavigate?: () => void;
}

export function NotificationList({ onNavigate }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
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
      if (!notification.is_read) void markAsRead(notification.id);
      if (notification.action_url) {
        onNavigate?.();
        try {
          router.push(actionUrlToRoute(notification.action_url) as never);
        } catch {
          /* navigation may fail */
        }
      }
    },
    [markAsRead, router, onNavigate]
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => {
      const icon = TYPE_ICONS[item.type] || 'notifications-outline';
      return (
        <Pressable
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: item.is_read
                ? pressed
                  ? theme.surface
                  : 'transparent'
                : isDark
                  ? colors.primary[900] + '30'
                  : colors.primary[50],
              borderBottomColor: theme.border,
            },
          ]}
          onPress={() => handlePress(item)}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
            ]}
          >
            <Ionicons name={icon} size={16} color={colors.primary[600]} />
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
          <Pressable
            onPress={() => dismiss(item.id)}
            hitSlop={8}
            style={styles.dismissBtn}
            accessibilityLabel="Benachrichtigung schließen"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={15} color={theme.textSecondary} />
          </Pressable>
        </Pressable>
      );
    },
    [isDark, theme, handlePress, dismiss]
  );

  const hasUnread = notifications.some((n) => !n.is_read);

  // Nothing to report means nothing to show. A heading over the words "Keine
  // Benachrichtigungen" is two lines spent saying there is no news, in a menu
  // whose job is to be short. The separator belongs to this block, so dropping
  // out takes it along instead of leaving a double rule behind.
  if (notifications.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.separator, { backgroundColor: theme.border }]} />
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Benachrichtigungen
        </Text>
        {hasUnread && (
          <Pressable onPress={markAllAsRead} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.readAll, { color: colors.primary[600] }]}>Alle gelesen</Text>
          </Pressable>
        )}
      </View>

      {isLoading && notifications.length === 0 ? (
        // The rows below: a 32-dp icon circle, a line of text and a timestamp.
        // The footer spinner on `onEndReached` stays a spinner — that one is
        // paging, not a surface arriving.
        <SkeletonRows count={5} leading={32} />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onRefresh={refresh}
          refreshing={isLoading}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary[600]} />
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xxsmall,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.xxsmall,
  },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readAll: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.small,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemContent: { flex: 1, gap: 2 },
  itemTitle: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '600' },
  itemBody: { fontFamily: BODY_FONT, fontSize: 12, lineHeight: 17 },
  itemTime: { fontFamily: BODY_FONT, fontSize: 10, marginTop: 2 },
  dismissBtn: { paddingTop: 4 },
  footer: { paddingVertical: spacing.medium, alignItems: 'center' },
});
