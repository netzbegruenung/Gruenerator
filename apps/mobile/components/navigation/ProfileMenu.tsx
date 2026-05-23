import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { useUnreadCount } from '../../hooks/useNotifications';
import { logout } from '../../services/auth';
import { lightTheme, darkTheme, colors, spacing, borderRadius } from '../../theme';
import { ProfileAvatar } from '../common';
import { NotificationList } from '../notifications/NotificationList';

interface MenuItem {
  key: string;
  label: string;
  icon: IoniconsIconName;
  href: Href;
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'gruppen', label: 'Gruppen', icon: 'people-outline', href: '/(tabs)/(desk)/gruppen' },
  {
    key: 'inhalte',
    label: 'Dateien',
    icon: 'folder-outline',
    href: { pathname: '/profile', params: { section: 'inhalte' } },
  },
  {
    key: 'einstellungen',
    label: 'Einstellungen',
    icon: 'settings-outline',
    href: { pathname: '/profile', params: { section: 'einstellungen' } },
  },
];

const getPossessiveForm = (name: string | undefined): string => {
  if (!name) return 'Dein';
  if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
    return `${name}'`;
  }
  return `${name}'s`;
};

interface Anchor {
  top: number;
  right: number;
}

const PANEL_WIDTH = 280;

export function ProfileMenu() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user, isLoggingOut } = useAuth();
  const { count: unreadCount } = useUnreadCount();

  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ top: 0, right: 0 });

  const handleOpen = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, triggerWidth, triggerHeight) => {
      setAnchor({
        top: y + triggerHeight + spacing.xsmall,
        right: screenWidth - (x + triggerWidth),
      });
      setOpen(true);
    });
  }, [screenWidth]);

  const navigateTo = useCallback(
    (href: Href) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleLogout = useCallback(() => {
    setOpen(false);
    void logout();
  }, []);

  const firstName = user?.display_name?.split(' ')[0];

  return (
    <>
      <Pressable ref={triggerRef} onPress={handleOpen} style={styles.trigger} hitSlop={8}>
        <ProfileAvatar
          avatarRobotId={user?.avatar_robot_id}
          displayName={user?.display_name}
          email={user?.email}
          size="small"
        />
        {unreadCount > 0 && (
          <View style={styles.triggerBadge}>
            <Text style={styles.triggerBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.panel,
              {
                top: anchor.top,
                right: anchor.right,
                maxHeight: screenHeight - anchor.top - spacing.large,
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              onPress={() => navigateTo('/profile')}
              style={({ pressed }) => [
                styles.header,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
              ]}
            >
              <ProfileAvatar
                avatarRobotId={user?.avatar_robot_id}
                displayName={user?.display_name}
                email={user?.email}
                size="medium"
              />
              <View style={styles.headerInfo}>
                <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
                  {getPossessiveForm(firstName)} Grünerator
                </Text>
                <Text
                  style={[styles.headerEmail, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {user?.email || ''}
                </Text>
              </View>
            </Pressable>

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            {MENU_ITEMS.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => navigateTo(item.href)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Ionicons name={item.icon} size={20} color={theme.textSecondary} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
              </Pressable>
            ))}

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            <NotificationList onNavigate={() => setOpen(false)} />

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            <Pressable
              onPress={handleLogout}
              disabled={isLoggingOut}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? theme.surface : 'transparent',
                  opacity: isLoggingOut ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error[600]} />
              <Text style={[styles.rowLabel, { color: colors.error[600] }]}>
                {isLoggingOut ? 'Wird abgemeldet…' : 'Abmelden'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'relative',
    padding: spacing.xxsmall,
  },
  triggerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.error[500],
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  triggerBadgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    width: PANEL_WIDTH,
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.xsmall,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerEmail: {
    fontSize: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xxsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    marginHorizontal: spacing.xsmall,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
