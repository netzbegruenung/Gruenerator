import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemByIndexProvider,
  useAui,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAgentStore, type Mentionable } from '@gruenerator/chat';
import { useAuth } from '@gruenerator/shared/hooks';
import { usePathname, useRouter, type Href } from 'expo-router';
import { type ReactElement, memo, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadCount } from '../../hooks/useNotifications';
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';
import { NewChatSheet } from '../chat/NewChatSheet';
import { ProfileAvatar } from '../common';

import type { Theme } from '../../theme/colors';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';

interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  screen: string;
  pathPrefix: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'start',
    label: 'Start',
    icon: 'home-outline',
    activeIcon: 'home',
    screen: 'start',
    pathPrefix: '/start',
  },
  {
    key: 'chat',
    label: 'Chat',
    icon: 'chatbubble-outline',
    activeIcon: 'chatbubble',
    screen: '(chat)',
    pathPrefix: '/(chat)',
  },
  {
    key: 'media',
    label: 'Medien',
    icon: 'videocam-outline',
    activeIcon: 'videocam',
    screen: '(media)',
    pathPrefix: '/(media)',
  },
  {
    key: 'docs',
    label: 'Dokumente',
    icon: 'document-text-outline',
    activeIcon: 'document-text',
    screen: '(docs)',
    pathPrefix: '/(docs)',
  },
  {
    key: 'recherche',
    label: 'Recherche',
    icon: 'search-outline',
    activeIcon: 'search',
    screen: '(recherche)',
    pathPrefix: '/(recherche)',
  },
];

const TOOL_ITEMS: NavItem[] = [
  {
    key: 'scanner',
    label: 'Scanner',
    icon: 'scan-outline',
    activeIcon: 'scan',
    screen: '(desk)',
    pathPrefix: '/(desk)/scanner',
  },
  {
    key: 'transkription',
    label: 'Transkription',
    icon: 'mic-outline',
    activeIcon: 'mic',
    screen: '(desk)',
    pathPrefix: '/(desk)/transkription',
  },
  {
    key: 'gruppen',
    label: 'Gruppen',
    icon: 'people-outline',
    activeIcon: 'people',
    screen: '(desk)',
    pathPrefix: '/(desk)/gruppen',
  },
];

const TOOL_ROUTES: Record<string, string> = {
  scanner: '/(tabs)/(desk)/scanner',
  transkription: '/(tabs)/(desk)/transkription',
  gruppen: '/(tabs)/(desk)/gruppen',
};

interface Props extends DrawerContentComponentProps {
  theme?: Theme;
}

const ThreadItem = memo(function ThreadItem({
  index,
  theme,
  onSelect,
}: {
  index: number;
  theme: Theme;
  onSelect: () => void;
}) {
  const aui = useAui();

  const handlePress = useCallback(() => {
    aui.threadListItem().switchTo();
    onSelect();
  }, [aui, onSelect]);

  return (
    <ThreadListItemByIndexProvider index={index} archived={false}>
      <ThreadListItemPrimitive.Root style={styles.threadItemRoot}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.threadItemTrigger,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.threadItemTitle, { color: theme.text }]} numberOfLines={1}>
            <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
          </Text>
        </Pressable>
      </ThreadListItemPrimitive.Root>
    </ThreadListItemByIndexProvider>
  );
});

export const SidebarDrawer = memo(function SidebarDrawer({ navigation, theme: themeProp }: Props) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { count: unreadCount } = useUnreadCount();
  const [sheetVisible, setSheetVisible] = useState(false);
  const aui = useAui();

  const navigateTo = useCallback(
    (screen: string, href?: string) => {
      if (href) {
        router.push(href as Href);
      } else {
        navigation.navigate(screen);
      }
      navigation.closeDrawer();
    },
    [navigation, router]
  );

  const handleNewChat = useCallback(() => {
    setSheetVisible(false);
    aui.threads().switchToNewThread();
    navigation.navigate('(chat)');
    navigation.closeDrawer();
  }, [aui, navigation]);

  const handleSelectNotebook = useCallback(
    (notebookId: string) => {
      setSheetVisible(false);
      useAgentStore.getState().setSelectedNotebook(notebookId);
      aui.threads().switchToNewThread();
      navigation.navigate('(chat)');
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSheetVisible(false);
      useAgentStore.getState().setSelectedAgent(agentId);
      aui.threads().switchToNewThread();
      navigation.navigate('(chat)');
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const handleInsertMention = useCallback(
    (mentionable: Mentionable) => {
      setSheetVisible(false);
      const trigger = mentionable.category === 'skill' ? '/' : '@';
      const text = `${trigger}${mentionable.mention} `;
      aui.composer().setText(text);
      aui.threads().switchToNewThread();
      navigation.navigate('(chat)');
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const handleThreadSelect = useCallback(() => {
    navigation.navigate('(chat)');
    navigation.closeDrawer();
  }, [navigation]);

  const renderThreadItem = useCallback(
    ({ index }: { threadId: string; index: number }): ReactElement => (
      <ThreadItem index={index} theme={theme} onSelect={handleThreadSelect} />
    ),
    [theme, handleThreadSelect]
  );

  const isActive = useCallback((item: NavItem) => pathname.includes(item.pathPrefix), [pathname]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.small },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
        <Pressable
          onPress={() => {
            router.push('/(fullscreen)/notifications' as Href);
            navigation.closeDrawer();
          }}
          style={styles.notificationButton}
        >
          <ProfileAvatar
            avatarRobotId={user?.avatar_robot_id}
            displayName={user?.display_name}
            email={user?.email}
            size="small"
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={[styles.separator, { backgroundColor: theme.border }]} />

      {/* Navigation Items */}
      <View style={styles.navSection}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Pressable
              key={item.key}
              onPress={() => navigateTo(item.screen)}
              style={({ pressed }) => [
                styles.navItem,
                {
                  backgroundColor: active
                    ? isDark
                      ? colors.primary[950]
                      : colors.primary[100]
                    : pressed
                      ? theme.surface
                      : 'transparent',
                },
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={20}
                color={
                  active
                    ? isDark
                      ? colors.primary[200]
                      : colors.primary[700]
                    : theme.textSecondary
                }
              />
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: active
                      ? isDark
                        ? colors.primary[200]
                        : colors.primary[700]
                      : theme.text,
                  },
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Tools subsection */}
        <View style={styles.toolsHeader}>
          <Text style={[styles.toolsLabel, { color: theme.textSecondary }]}>Werkzeuge</Text>
        </View>
        {TOOL_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Pressable
              key={item.key}
              onPress={() => navigateTo(item.screen, TOOL_ROUTES[item.key])}
              style={({ pressed }) => [
                styles.navItem,
                {
                  backgroundColor: active
                    ? isDark
                      ? colors.primary[950]
                      : colors.primary[100]
                    : pressed
                      ? theme.surface
                      : 'transparent',
                },
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={20}
                color={
                  active
                    ? isDark
                      ? colors.primary[200]
                      : colors.primary[700]
                    : theme.textSecondary
                }
              />
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: active
                      ? isDark
                        ? colors.primary[200]
                        : colors.primary[700]
                      : theme.text,
                  },
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.separator, { backgroundColor: theme.border }]} />

      {/* Chat Threads */}
      <ThreadListPrimitive.Root style={styles.threadSection}>
        <View style={styles.threadHeader}>
          <Text style={[styles.threadHeaderTitle, { color: theme.text }]}>Unterhaltungen</Text>
          <ThreadListPrimitive.New style={styles.newThreadButton}>
            <Ionicons name="create-outline" size={20} color={colors.primary[600]} />
          </ThreadListPrimitive.New>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.sourceRow,
            {
              backgroundColor: pressed ? theme.surface : 'transparent',
              borderColor: theme.border,
            },
          ]}
          onPress={() => setSheetVisible(true)}
        >
          <Ionicons name="library-outline" size={16} color={colors.primary[600]} />
          <Text style={[styles.sourceText, { color: theme.text }]}>Neuer Chat mit Quelle...</Text>
        </Pressable>

        <ThreadListPrimitive.Items
          renderItem={renderThreadItem}
          style={styles.threadList}
          contentContainerStyle={styles.threadListContent}
        />
      </ThreadListPrimitive.Root>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.border, paddingBottom: insets.bottom + spacing.small },
        ]}
      >
        <Pressable
          onPress={() => {
            router.push('/profile' as Href);
            navigation.closeDrawer();
          }}
          style={({ pressed }) => [
            styles.profileRow,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <ProfileAvatar
            avatarRobotId={user?.avatar_robot_id}
            displayName={user?.display_name}
            email={user?.email}
            size="small"
          />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
              {user?.display_name || 'Profil'}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]} numberOfLines={1}>
              {user?.email || ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>

      <NewChatSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onNewChat={handleNewChat}
        onSelectNotebook={handleSelectNotebook}
        onSelectAgent={handleSelectAgent}
        onInsertMention={handleInsertMention}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  notificationButton: {
    position: 'relative',
    padding: spacing.xxsmall,
  },
  badge: {
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
  badgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.small,
  },
  navSection: {
    paddingHorizontal: spacing.xsmall,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  navLabelActive: {
    fontWeight: '600',
  },
  toolsHeader: {
    paddingHorizontal: spacing.small,
    paddingTop: spacing.medium,
    paddingBottom: spacing.xxsmall,
  },
  toolsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  threadSection: {
    flex: 1,
    minHeight: 0,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xxsmall,
  },
  threadHeaderTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  newThreadButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginHorizontal: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  sourceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  threadList: {
    flex: 1,
  },
  threadListContent: {
    paddingHorizontal: spacing.xxsmall,
    paddingTop: spacing.xsmall,
  },
  threadItemRoot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threadItemTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
  },
  threadItemTitle: {
    flex: 1,
    fontSize: 13,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.small,
    paddingHorizontal: spacing.xsmall,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
  },
  profileInfo: {
    flex: 1,
    gap: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 11,
  },
});
