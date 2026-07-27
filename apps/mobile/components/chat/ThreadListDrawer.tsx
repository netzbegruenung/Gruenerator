import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemByIndexProvider,
  useAui,
  useAuiState,
} from '@assistant-ui/react-native';
import { MenuView } from '@expo/ui/community/menu';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { type ReactElement, memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsSheetStore } from '../../stores/settingsSheetStore';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';
import { route, routeWithParams, type AppRoute } from '../../types/routes';
import { ProfileAvatar } from '../common';
import { MenuIcon } from '../icons/WebMirrorIcons';
import { STUDIO_TOOLS, TOOLS, type ToolDef } from '../tools/toolsConfig';

import { asThreadMenuId, buildThreadMenuActions } from './menuActions';
import { ThreadRenameSheet } from './ThreadRenameSheet';
import { ThreadShareSheet } from './ThreadShareSheet';

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
  archived,
  onSelect,
  onOpenSheet,
  isActive,
}: {
  theme: Theme;
  archived: boolean;
  onSelect: () => void;
  /** Only the two entries that need a surface of their own. */
  onOpenSheet: (kind: ThreadSheet) => void;
  isActive: boolean;
}) {
  const aui = useAui();
  const router = useRouter();

  const menuActions = useMemo(() => buildThreadMenuActions(archived), [archived]);

  // Archiving and deleting run right here rather than travelling up to a host:
  // this component already sits inside the row's `ThreadListItemByIndexProvider`,
  // so `aui.threadListItem()` is the right thread. Only renaming and sharing
  // need a surface, and those are what `onOpenSheet` is for.
  const handleMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      const id = asThreadMenuId(nativeEvent.event);
      if (id === 'rename' || id === 'share') {
        onOpenSheet(id);
        return;
      }
      if (id === 'archive') aui.threadListItem().archive();
      else if (id === 'unarchive') aui.threadListItem().unarchive();
      else if (id === 'delete') {
        const { title } = aui.threadListItem().getState();
        Alert.alert('Unterhaltung löschen', `"${title || 'Neue Unterhaltung'}" wirklich löschen?`, [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: () => aui.threadListItem().delete() },
        ]);
      }
    },
    [aui, onOpenSheet]
  );

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

  return (
    <ThreadListItemPrimitive.Root style={styles.itemRoot}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.itemTrigger,
          { backgroundColor: pressed ? theme.surface : 'transparent' },
        ]}
      >
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
          <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
        </Text>
      </Pressable>
      {/* The dot marks the row, so it stays with the title. Behind the menu
          button it read as one more control rather than as state. */}
      {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary[500] }]} />}
      {/* The row's long-press is gone with the sheet. It opened the same thing
          this button does, and a long-press on a list row is the gesture the
          platform reserves for its own context menu — which is now what this
          is. */}
      <MenuView
        actions={menuActions}
        onPressAction={handleMenuAction}
        style={styles.itemMore}
        testID="thread-item-more"
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
      </MenuView>
    </ThreadListItemPrimitive.Root>
  );
});

/** The two menu entries that need a surface of their own. */
type ThreadSheet = 'rename' | 'share';

/** Which row a sheet is acting on, and which sheet it is. */
interface SelectedThread {
  index: number;
  archived: boolean;
  sheet: ThreadSheet;
}

/**
 * Host for the two sheets the menu cannot hold itself. Sits inside a
 * `ThreadListItemByIndexProvider` for the selected row, so `aui.threadListItem()`
 * resolves to that thread — the same reason `ThreadItemBody` reads `aui` from
 * inside the provider rather than above it. One host for the whole drawer
 * instead of a sheet per row.
 */
const ThreadSheetHost = memo(function ThreadSheetHost({
  theme,
  sheet,
  onClose,
}: {
  theme: Theme;
  sheet: ThreadSheet;
  onClose: () => void;
}) {
  const aui = useAui();
  const state = aui.threadListItem().getState();

  const rename = useCallback((title: string) => aui.threadListItem().rename(title), [aui]);

  return sheet === 'rename' ? (
    <ThreadRenameSheet
      visible
      theme={theme}
      title={state.title}
      onRename={rename}
      onClose={onClose}
    />
  ) : (
    <ThreadShareSheet visible threadId={state.remoteId ?? null} theme={theme} onClose={onClose} />
  );
});

const ThreadItem = memo(function ThreadItem({
  index,
  theme,
  onSelect,
  onOpenSheet,
  isActive,
  archived = false,
}: {
  index: number;
  theme: Theme;
  onSelect: () => void;
  onOpenSheet: (selected: SelectedThread) => void;
  isActive: boolean;
  archived?: boolean;
}) {
  const openSheet = useCallback(
    (kind: ThreadSheet) => onOpenSheet({ index, archived, sheet: kind }),
    [onOpenSheet, index, archived]
  );
  return (
    <ThreadListItemByIndexProvider index={index} archived={archived}>
      <ThreadItemBody
        theme={theme}
        archived={archived}
        onSelect={onSelect}
        onOpenSheet={openSheet}
        isActive={isActive}
      />
    </ThreadListItemByIndexProvider>
  );
});

/**
 * The archived conversations, collapsed. `ThreadListPrimitive.Items` renders
 * only the live list on React Native — unlike web's, it takes no `archived`
 * prop — so this reads `threads.archivedThreadIds` directly and addresses each
 * row by its index in that list.
 *
 * Without it, archiving would be a one-way door.
 */
const ArchivedSection = memo(function ArchivedSection({
  theme,
  onSelect,
  onOpenSheet,
}: {
  theme: Theme;
  onSelect: () => void;
  onOpenSheet: (selected: SelectedThread) => void;
}) {
  const archivedIds = useAuiState((s) => s.threads.archivedThreadIds);
  const [expanded, setExpanded] = useState(false);

  if (archivedIds.length === 0) return null;

  return (
    <View style={styles.archiveSection}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={styles.archiveToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Ionicons name="archive-outline" size={16} color={theme.textSecondary} />
        <Text style={[styles.archiveLabel, { color: theme.textSecondary }]}>
          Archiviert ({archivedIds.length})
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>
      {expanded
        ? archivedIds.map((threadId, index) => (
            <ThreadItem
              key={threadId}
              index={index}
              archived
              theme={theme}
              onSelect={onSelect}
              onOpenSheet={onOpenSheet}
              isActive={false}
            />
          ))
        : null}
    </View>
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
          <MenuIcon name={tool.icon} size={DRAWER_ICON} color={theme.text} />
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
  const openSettings = useSettingsSheetStore((s) => s.open);
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

  const [selected, setSelected] = useState<SelectedThread | null>(null);
  const closeSheet = useCallback(() => setSelected(null), []);

  const renderItem = useCallback(
    ({ threadId, index }: { threadId: string; index: number }): ReactElement => (
      <ThreadItem
        index={index}
        theme={theme}
        onSelect={closeDrawer}
        onOpenSheet={setSelected}
        isActive={threadId === activeThreadId}
      />
    ),
    [theme, closeDrawer, activeThreadId]
  );

  const listHeader = useMemo(
    () => <DrawerSections theme={theme} tools={tools} onSelectTool={handleNavigate} />,
    [theme, tools, handleNavigate]
  );

  const listFooter = useMemo(
    () => <ArchivedSection theme={theme} onSelect={closeDrawer} onOpenSheet={setSelected} />,
    [theme, closeDrawer]
  );

  return (
    <ThreadListPrimitive.Root style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.small }]}>
        {/* The wordmark is the way home, the way it is on web. */}
        <Pressable
          onPress={() => handleNavigate('/start')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zur Startseite"
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
        </Pressable>
        {/* Not ThreadListPrimitive.New: that calls switchToNewThread() on the
            drawer's own ambient runtime, which is not the one the focused
            conversation creates — so it changed nothing and never navigated.
            Measured on device: the button was dead. Same path as the empty
            state's button, which is the one that worked. */}
        <Pressable
          onPress={handleNewChat}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Neue Unterhaltung"
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={26} color={colors.primary[600]} />
        </Pressable>
      </View>

      <ThreadListPrimitive.Items
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={<EmptyThreads theme={theme} onNewChat={handleNewChat} />}
      />

      {selected && (
        <ThreadListItemByIndexProvider index={selected.index} archived={selected.archived}>
          <ThreadSheetHost theme={theme} sheet={selected.sheet} onClose={closeSheet} />
        </ThreadListItemByIndexProvider>
      )}

      <ProfileFooter
        theme={theme}
        insetBottom={insets.bottom}
        onPress={() => {
          closeDrawer();
          openSettings();
        }}
      />
    </ThreadListPrimitive.Root>
  );
});

/** The drawer's single text edge, measured from the panel's left border. */
const DRAWER_EDGE = 20;

/** One row height for both lists — navigation and conversations. */
const ROW_HEIGHT = 52;

/** Paired with the row text: a 20dp glyph read undersized beside 17pt. */
const DRAWER_ICON = 22;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Drawer geometry ──────────────────────────────────────────────────────
  // Two vertical edges, not four. Everything without an icon — the title, the
  // "Letzte" label, the conversation rows — starts at DRAWER_EDGE; rows with an
  // icon put their LABEL at DRAWER_EDGE + icon + gap, and the icon itself on the
  // same edge as the text above it. Before this the four were 16, 20, 24 and 60,
  // three of which were nobody's decision — they fell out of a container padding
  // plus a row padding.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: DRAWER_EDGE,
    paddingRight: spacing.small,
    paddingBottom: spacing.small,
  },
  headerTitle: {
    fontFamily: BODY_FONT,
    fontSize: 24,
    fontWeight: '700',
  },
  newButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    marginHorizontal: spacing.xsmall,
    // 8 (list) + 8 (margin) + 4 = 20: the icon sits on the same edge as the text
    // of every row without one.
    paddingHorizontal: spacing.xxsmall,
    minHeight: ROW_HEIGHT,
    borderRadius: borderRadius.medium,
  },
  // chatBody, not chatTitle: in the drawer these rows ARE the content, not the
  // heading of a card sitting inside it. At chatTitle's 15 they read as captions
  // next to a 24pt wordmark in a 52dp row — the reference sits at ~17.
  navLabel: {
    ...chatType.chatBody,
    fontWeight: '500',
  },
  sectionLabel: {
    ...chatType.chatLabel,
    fontWeight: '700',
    paddingHorizontal: spacing.small,
    // The turn from navigation to content. At the old 16 it read as one more
    // row gap instead of a change of subject.
    marginTop: spacing.xlarge + spacing.xsmall,
    marginBottom: spacing.xsmall,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xsmall,
  },
  archiveSection: {
    marginTop: spacing.small,
  },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
  },
  archiveLabel: {
    ...chatType.chatLabel,
    flex: 1,
    fontWeight: '700',
  },
  itemRoot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemMore: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  itemTrigger: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    // Same height as a nav row: the two lists used 45 and 49dp, which is not a
    // distinction anybody can see — only one they can feel as unevenness.
    minHeight: ROW_HEIGHT,
    borderRadius: borderRadius.medium,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.small,
  },
  itemTitle: {
    ...chatType.chatBody,
    flex: 1,
    fontFamily: BODY_FONT,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.xlarge,
    gap: spacing.small,
  },
  emptyTitle: {
    fontFamily: BODY_FONT,
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
    paddingHorizontal: DRAWER_EDGE,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerName: {
    ...chatType.chatTitle,
    flex: 1,
    fontFamily: BODY_FONT,
    fontWeight: '500',
  },
});
