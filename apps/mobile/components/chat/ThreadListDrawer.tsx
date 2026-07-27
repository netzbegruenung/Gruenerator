import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemByIndexProvider,
  useAui,
  useAuiState,
} from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { type ReactElement, memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTheme } from '../../hooks/useTheme';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, borderRadius, chatType } from '../../theme';
import { route, routeWithParams, type AppRoute } from '../../types/routes';
import { ProfileAvatar } from '../common';
import { STUDIO_TOOLS, TOOLS, type ToolDef } from '../tools/toolsConfig';

import type { Theme } from '../../theme/colors';

interface Props {
  theme?: Theme;
}

// The body must read `aui` from *inside* ThreadListItemByIndexProvider so that
// `aui.threadListItem()` resolves to this row's thread. Calling useAui() above the
// provider (as the outer ThreadItem does) yields the ambient "new" thread instead —
// no remoteId — which silently breaks tap-to-open and delete.
const ThreadItemBody = memo(function ThreadItemBody({
  theme,
  onSelect,
  isActive,
}: {
  theme: Theme;
  onSelect: () => void;
  isActive: boolean;
}) {
  const aui = useAui();
  const router = useRouter();

  const handlePress = useCallback(() => {
    const { remoteId } = aui.threadListItem().getState();
    // Push first, THEN close the drawer: the conversation mounts behind the open
    // drawer, so closing it reveals the conversation directly instead of briefly
    // flashing the screen underneath (looks like a double navigation otherwise).
    if (remoteId) {
      router.push(routeWithParams('/(focused)/chat-conversation', { threadId: remoteId }));
    }
    onSelect();
  }, [aui, onSelect, router]);

  const handleDelete = useCallback(() => {
    const title = aui.threadListItem().getState().title;
    Alert.alert('Unterhaltung löschen', `"${title || 'Neue Unterhaltung'}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => aui.threadListItem().delete(),
      },
    ]);
  }, [aui]);

  return (
    <ThreadListItemPrimitive.Root style={styles.itemRoot}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleDelete}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.itemTrigger,
          { backgroundColor: pressed ? theme.surface : 'transparent' },
        ]}
      >
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
          <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
        </Text>
      </Pressable>
      {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary[500] }]} />}
    </ThreadListItemPrimitive.Root>
  );
});

const ThreadItem = memo(function ThreadItem({
  index,
  theme,
  onSelect,
  isActive,
}: {
  index: number;
  theme: Theme;
  onSelect: () => void;
  isActive: boolean;
}) {
  return (
    <ThreadListItemByIndexProvider index={index} archived={false}>
      <ThreadItemBody theme={theme} onSelect={onSelect} isActive={isActive} />
    </ThreadListItemByIndexProvider>
  );
});

// One flat tool list instead of the old Favoriten + Schnellstart pair: the drawer
// now mirrors web's sidebar, which lists tools rather than pinned agents (those
// live on the Grüneratoren tool's own screen). Starred tools sort to the top so
// the star still does something here. No heading above them — the rows read as
// the menu they are, and the saved line goes to the thread list.
function DrawerSections({
  theme,
  tools,
  onSelectTool,
}: {
  theme: Theme;
  tools: ToolDef[];
  onSelectTool: (route: AppRoute) => void;
}) {
  return (
    <View>
      {tools.map((tool) => (
        <Pressable
          key={tool.id}
          onPress={() => onSelectTool(tool.route)}
          style={({ pressed }) => [
            styles.navRow,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <Ionicons name={tool.icon} size={20} color={theme.text} />
          <Text style={[styles.navLabel, { color: theme.text }]} numberOfLines={1}>
            {tool.title}
          </Text>
        </Pressable>
      ))}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Letzte</Text>
    </View>
  );
}

function EmptyThreads({ theme, onNewChat }: { theme: Theme; onNewChat: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="chatbubbles-outline" size={32} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Noch keine Unterhaltungen</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        Starte deine erste Unterhaltung mit dem Grünerator.
      </Text>
      <Pressable
        onPress={onNewChat}
        style={({ pressed }) => [styles.emptyButton, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="create-outline" size={18} color={colors.white} />
        <Text style={styles.emptyButtonText}>Neue Unterhaltung</Text>
      </Pressable>
    </View>
  );
}

function ProfileFooter({
  theme,
  insetBottom,
  onPress,
}: {
  theme: Theme;
  insetBottom: number;
  onPress: () => void;
}) {
  const { user } = useAuth();
  const name = user?.display_name || user?.email || 'Profil';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.footer,
        {
          paddingBottom: insetBottom + spacing.small,
          borderTopColor: theme.border,
          backgroundColor: pressed ? theme.surface : 'transparent',
        },
      ]}
    >
      <ProfileAvatar
        avatarRobotId={user?.avatar_robot_id}
        displayName={user?.display_name}
        email={user?.email}
        size="small"
      />
      <Text style={[styles.footerName, { color: theme.text }]} numberOfLines={1}>
        {name}
      </Text>
      <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export const ThreadListDrawer = memo(function ThreadListDrawer({ theme: themeProp }: Props) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);
  const activeThreadId = useAuiState((s) => s.threadListItem.id);
  const favouriteIds = useToolFavoritesStore((s) => s.favorites);
  // Top-level tools, plus any favourited Studio sub-tool so starring one does not
  // make it disappear from here. Starred entries sort to the top.
  const tools = useMemo(() => {
    const rank = (t: ToolDef) => {
      const i = favouriteIds.indexOf(t.id);
      return i === -1 ? favouriteIds.length : i;
    };
    const studioFavourites = STUDIO_TOOLS.filter((t) => favouriteIds.includes(t.id));
    return [...TOOLS, ...studioFavourites].sort((a, b) => rank(a) - rank(b));
  }, [favouriteIds]);

  const handleNavigate = useCallback(
    (path: AppRoute) => {
      closeDrawer();
      router.push(route(path));
    },
    [closeDrawer, router]
  );

  // The drawer is a pure navigator (mirrors web's Sidebar): it pushes to the
  // focused chat-conversation screen with a fresh thread, and that screen owns
  // the agent/notebook store writes. The drawer's own `aui` runtime is NOT the
  // focused conversation's runtime (MobileChatProvider creates its own), so
  // manipulating composer/threads here would target the wrong surface.
  const handleNewChat = useCallback(() => {
    // Push before closing the drawer to avoid flashing the screen underneath
    // (see handlePress).
    router.push(routeWithParams('/(focused)/chat-conversation', { threadId: 'new' }));
    closeDrawer();
  }, [closeDrawer, router]);

  const renderItem = useCallback(
    ({ threadId, index }: { threadId: string; index: number }): ReactElement => (
      <ThreadItem
        index={index}
        theme={theme}
        onSelect={closeDrawer}
        isActive={threadId === activeThreadId}
      />
    ),
    [theme, closeDrawer, activeThreadId]
  );

  const listHeader = useMemo(
    () => <DrawerSections theme={theme} tools={tools} onSelectTool={handleNavigate} />,
    [theme, tools, handleNavigate]
  );

  return (
    <ThreadListPrimitive.Root style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.small }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
        <ThreadListPrimitive.New style={styles.newButton}>
          <Ionicons name="add-circle-outline" size={26} color={colors.primary[600]} />
        </ThreadListPrimitive.New>
      </View>

      <ThreadListPrimitive.Items
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyThreads theme={theme} onNewChat={handleNewChat} />}
      />

      <ProfileFooter
        theme={theme}
        insetBottom={insets.bottom}
        onPress={() => handleNavigate('/profile')}
      />
    </ThreadListPrimitive.Root>
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
  newButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginHorizontal: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  navLabel: {
    ...chatType.chatTitle,
    fontWeight: '500',
  },
  sectionLabel: {
    ...chatType.chatLabel,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xsmall,
  },
  itemRoot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTrigger: {
    flex: 1,
    paddingHorizontal: spacing.small,
    paddingVertical: 14,
    borderRadius: borderRadius.medium,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.small,
  },
  itemTitle: {
    ...chatType.chatTitle,
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.xlarge,
    gap: spacing.small,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.xsmall,
  },
  emptyText: {
    ...chatType.chatSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[600],
  },
  emptyButtonText: {
    ...chatType.chatSecondary,
    fontWeight: '600',
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerName: {
    ...chatType.chatTitle,
    flex: 1,
    fontWeight: '500',
  },
});
