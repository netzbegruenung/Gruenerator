import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemByIndexProvider,
  useAui,
  useAuiState,
} from '@assistant-ui/react-native';
import {
  getPinnedAgents,
  useAgentStore,
  type Mentionable,
  type PinnedAgent,
} from '@gruenerator/chat';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { type ReactElement, memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTheme } from '../../hooks/useTheme';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, borderRadius } from '../../theme';
import { route, routeWithParams, type AppRoute } from '../../types/routes';
import { ProfileAvatar } from '../common';
import { TOOLS, type ToolDef } from '../tools/toolsConfig';

import { NewChatSheet } from './NewChatSheet';
import { agentIcon } from './sidebarIcons';

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

function DrawerSections({
  theme,
  agents,
  favouriteTools,
  onSelectAgent,
  onSelectTool,
  onOpenSources,
}: {
  theme: Theme;
  agents: PinnedAgent[];
  favouriteTools: ToolDef[];
  onSelectAgent: (agentId: string) => void;
  onSelectTool: (route: AppRoute) => void;
  onOpenSources: () => void;
}) {
  return (
    <View>
      {favouriteTools.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Favoriten</Text>
          {favouriteTools.map((tool) => (
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
        </>
      )}

      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Schnellstart</Text>
      {agents.map((agent) => (
        <Pressable
          key={agent.identifier}
          onPress={() => onSelectAgent(agent.identifier)}
          style={({ pressed }) => [
            styles.navRow,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <Ionicons name={agentIcon(agent.iconKey)} size={20} color={theme.text} />
          <Text style={[styles.navLabel, { color: theme.text }]} numberOfLines={1}>
            {agent.title}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onOpenSources}
        style={({ pressed }) => [
          styles.navRow,
          { backgroundColor: pressed ? theme.surface : 'transparent' },
        ]}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
        <Text style={[styles.navLabel, { color: theme.text }]}>Mehr</Text>
      </Pressable>

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
  const [sheetVisible, setSheetVisible] = useState(false);
  const { locale } = useAuth();
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);
  const activeThreadId = useAuiState((s) => s.threadListItem.id);
  const pinnedAgents = useMemo(() => getPinnedAgents(locale), [locale]);
  const favouriteIds = useToolFavoritesStore((s) => s.favorites);
  const favouriteTools = useMemo(
    () =>
      favouriteIds
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is ToolDef => t !== undefined),
    [favouriteIds]
  );

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
  const openNewConversation = useCallback(
    (params: { agentId?: string; notebookId?: string; initialComposerText?: string }) => {
      setSheetVisible(false);
      // Push before closing the drawer to avoid flashing the screen underneath
      // (see handlePress).
      router.push(routeWithParams('/(focused)/chat-conversation', { threadId: 'new', ...params }));
      closeDrawer();
    },
    [closeDrawer, router]
  );

  const handleNewChat = useCallback(() => {
    openNewConversation({});
  }, [openNewConversation]);

  const handleSelectNotebook = useCallback(
    (notebookId: string) => {
      openNewConversation({ notebookId });
    },
    [openNewConversation]
  );

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      openNewConversation({ agentId });
    },
    [openNewConversation]
  );

  const handleInsertMention = useCallback(
    (mentionable: Mentionable) => {
      const trigger = mentionable.category === 'skill' ? '/' : '@';
      openNewConversation({ initialComposerText: `${trigger}${mentionable.mention} ` });
    },
    [openNewConversation]
  );

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
    () => (
      <DrawerSections
        theme={theme}
        agents={pinnedAgents}
        favouriteTools={favouriteTools}
        onSelectAgent={handleSelectAgent}
        onSelectTool={handleNavigate}
        onOpenSources={() => setSheetVisible(true)}
      />
    ),
    [theme, pinnedAgents, favouriteTools, handleSelectAgent, handleNavigate]
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

      <NewChatSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onNewChat={handleNewChat}
        onSelectNotebook={handleSelectNotebook}
        onSelectAgent={handleSelectAgent}
        onInsertMention={handleInsertMention}
        onSeeAllAgents={() => handleNavigate('/(focused)/agents')}
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
    fontSize: 15,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 13,
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
    flex: 1,
    fontSize: 15,
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
    fontSize: 14,
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
    fontSize: 14,
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
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
