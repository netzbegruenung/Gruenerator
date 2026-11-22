import {
  austauschItems,
  canShareIntoGroup,
  filterGroupFeed,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  type ScrollViewInstance,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuActionSheet } from '../../../../components/chat/MenuActionSheet';
import { SkeletonBar, SkeletonGroup, SkeletonRows } from '../../../../components/common';
import { Fab } from '../../../../components/common/Fab';
import { NeutralBackdrop } from '../../../../components/common/NeutralBackdrop';
import { SegmentedControl } from '../../../../components/common/SegmentedControl';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { buildAddActions } from '../../../../components/projekte/addMenu';
import { GroupCommentsSheet } from '../../../../components/projekte/GroupCommentsSheet';
import { GroupFeedCard } from '../../../../components/projekte/GroupFeedCard';
import { knowledgeItems } from '../../../../components/projekte/knowledgeMenu';
import { PostComposerRow } from '../../../../components/projekte/PostComposerRow';
import { canWritePost } from '../../../../components/projekte/postRules';
import { ProjectChatComposer } from '../../../../components/projekte/ProjectChatComposer';
import { ProjectChatList } from '../../../../components/projekte/ProjectChatList';
import { ProjectInstructionsCard } from '../../../../components/projekte/ProjectInstructionsCard';
import { ProjectKnowledgeList } from '../../../../components/projekte/ProjectKnowledgeList';
import { ProjectLinks } from '../../../../components/projekte/ProjectLinks';
import { ProjectMembersPreview } from '../../../../components/projekte/ProjectMembersPreview';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import { openGroupFeedItem, useBearerToken, useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import { useHiddenMemberIds } from '../../../../hooks/useHiddenMembers';
import { useProjectAddActions } from '../../../../hooks/useProjectAddActions';
import { useProjectChats } from '../../../../hooks/useProjectChats';
import { useShareItemActions } from '../../../../hooks/useShareItemActions';
import { useTheme } from '../../../../hooks/useTheme';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../../theme/layout';
import { filterHiddenFeed } from '../../../../utils/hiddenMembers';
import { goBackOr } from '../../../../utils/navigation';

type ViewMode = 'uebersicht' | 'austausch';

/**
 * Ein Projekt bzw. eine Gruppe. „Übersicht“: neuer Chat, die Chats des Projekts,
 * Anweisungen, Wissen, Links und Mitglieder. „Austausch“ (nur Gruppen): Beiträge
 * und Freigaben, über die gesprochen wird — Angeheftetes oben. Über „+“ legt man
 * eigene Inhalte hinein. Wer geteilt hat (oder Admin ist), ändert über „…“ bzw.
 * langes Drücken die Rolle, die Notiz oder die Freigabe; Admins heften an.
 * Eigene Beiträge schreibt man über die Zeile oben im Austausch bzw. „+“; die
 * übrige Verwaltung bleibt dem Web.
 */
export default function ProjektDetailScreen() {
  // `beitrag`: aus einer Benachrichtigung — zu diesem Beitrag scrollen.
  const { id, beitrag } = useLocalSearchParams<{ id: string; beitrag?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const insets = useSafeAreaInsets();

  const detailsQuery = useGroupDetails(id);
  const feedQuery = useGroupFeed(id);
  const membersQuery = useGroupMembers(id);
  const token = useBearerToken();
  const group = detailsQuery.data?.group;
  const isSystem = group?.is_system === true;
  // Ein Projekt ist allein oder mit anderen nutzbar, unabhängig vom gespeicherten
  // `group_type`: Austausch und „Für das Team“ erscheinen erst, wenn jemand dabei ist.
  const hasOthers = isSystem || (group?.member_count ?? 0) > 1;
  const isTeam = !!group && !isSystem;
  // Wie im Web: ins System-Projekt teilen nur Instanz-Admins.
  const isAdmin = !!detailsQuery.data?.membership.isAdmin;
  const canAdd =
    !!group &&
    canShareIntoGroup({
      is_system: group.is_system,
      isAdmin,
      archived_at: group.archived_at ?? null,
    });
  const shareActions = useShareItemActions(id ?? null, isAdmin, hasOthers);
  const addActions = useProjectAddActions(id ?? null);
  const userName = useAuthStore((s) => s.user?.display_name ?? null);
  const canPost = !!group && canWritePost(group, isAdmin);
  const addMenu = useMemo(() => buildAddActions(canPost), [canPost]);
  const writePost = () =>
    router.push({ pathname: '/(focused)/projekte/[id]/beitrag', params: { id: id ?? '' } });

  // Wie im Web: ein Link auf einen Beitrag und das System-Projekt öffnen im Austausch.
  const [chosenView, setChosenView] = useState<ViewMode | null>(null);
  // Wissen-Einträge, die jemand aus der Liste in den Austausch geholt hat.
  const [discussed, setDiscussed] = useState<ReadonlySet<string>>(new Set());
  const [focusShareId, setFocusShareId] = useState<string | null>(beitrag ?? null);
  const [query, setQuery] = useState('');
  // Die Suche wartet hinter einem FAB statt als feste Zeile über dem Austausch.
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };
  const [addOpen, setAddOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<GroupFeedItem | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // Karte und Liste melden ihre Lage getrennt (die Karte zuerst); gescrollt wird einmal, wenn beide da sind.
  const focus = useRef<{ listY: number | null; cardY: number | null; done: boolean }>({
    listY: null,
    cardY: null,
    done: false,
  });
  const scrollToFocus = () => {
    const f = focus.current;
    if (f.done || f.listY === null || f.cardY === null) return;
    f.done = true;
    scrollRef.current?.scrollTo({
      y: Math.max(0, f.listY + f.cardY - spacing.small),
      animated: true,
    });
  };

  const activeView: ViewMode = !hasOthers
    ? 'uebersicht'
    : (chosenView ?? (beitrag || isSystem ? 'austausch' : 'uebersicht'));
  const hiddenIds = useHiddenMemberIds();
  const items = useMemo(
    () => filterHiddenFeed(feedQuery.data ?? [], hiddenIds),
    [feedQuery.data, hiddenIds]
  );
  const visible = useMemo(
    () => filterGroupFeed(austauschItems(items, discussed, focusShareId), query),
    [items, discussed, focusShareId, query]
  );
  const knowledge = useMemo(() => knowledgeItems(items), [items]);
  const members = membersQuery.data ?? [];
  const showChats = canAdd && !isSystem;
  const chatsQuery = useProjectChats(id, showChats);
  const onDiscuss = !hasOthers
    ? null
    : (item: GroupFeedItem) => {
        const shareId = item.share?.shareId;
        if (!shareId) return;
        setDiscussed((prev) => new Set(prev).add(shareId));
        setFocusShareId(shareId);
        closeSearch();
        focus.current = { listY: null, cardY: null, done: false };
        setChosenView('austausch');
      };
  const open = useCallback((item: GroupFeedItem) => openGroupFeedItem(router, item), [router]);

  const scaffold = (children: ReactNode): ReactNode => (
    <ScreenScaffold
      backdrop={<NeutralBackdrop />}
      title={group?.name ?? 'Projekt'}
      onBack={() => goBackOr('/(focused)/projekte')}
      headerRight={
        <View style={styles.headerActions}>
          {canAdd ? (
            <Pressable
              onPress={() => setAddOpen(true)}
              disabled={addActions.busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Inhalte hinzufügen"
              style={[styles.headerButton, { backgroundColor: theme.card }]}
            >
              {addActions.busy ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Ionicons name="add" size={22} color={theme.text} />
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(focused)/projekte/[id]/info', params: { id: id ?? '' } })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Projekt-Info anzeigen"
            style={[styles.headerButton, { backgroundColor: theme.card }]}
          >
            <Ionicons name="people-outline" size={20} color={theme.text} />
          </Pressable>
        </View>
      }
    >
      {children}
    </ScreenScaffold>
  );

  if (detailsQuery.isPending) {
    return scaffold(
      <View style={styles.scrollContent}>
        <SkeletonGroup style={styles.skeletonHead}>
          <SkeletonBar width="100%" height={40} radius={12} />
        </SkeletonGroup>
        <SkeletonRows count={4} leading={44} />
      </View>
    );
  }

  if (detailsQuery.error || !group) {
    return scaffold(
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={44} color={colors.semantic.error} />
        {/* The shared hook's message says "Gruppe"; this screen says "Projekt". */}
        <Text style={[styles.centeredText, { color: colors.semantic.error }]}>
          Projekt konnte nicht geladen werden.
        </Text>
        <Pressable
          onPress={() => void detailsQuery.refetch()}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: tone.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  const emptyText = query.trim()
    ? `Kein Beitrag passt zu „${query.trim()}“.`
    : canAdd
      ? `Noch nichts im Austausch. Schreib etwas an das Projekt oder teile einen Inhalt mit einer Notiz.`
      : 'Noch keine Beiträge.';

  return scaffold(
    <>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={() => {
              void detailsQuery.refetch();
              void feedQuery.refetch();
              void membersQuery.refetch();
              if (showChats) void chatsQuery.refetch();
            }}
          />
        }
      >
        {hasOthers && (
          <View style={styles.padded}>
            <SegmentedControl
              accessibilityLabel="Ansicht"
              activeColor={tone.accent}
              value={activeView}
              onChange={(v) => setChosenView(v as ViewMode)}
              options={[
                {
                  value: 'uebersicht',
                  label: 'Übersicht',
                  short: 'Übersicht',
                  disabled: false,
                },
                {
                  value: 'austausch',
                  label: 'Austausch',
                  short: 'Austausch',
                  disabled: false,
                },
              ]}
            />
          </View>
        )}

        {activeView === 'uebersicht' ? (
          <View style={styles.padded}>
            {showChats && id ? (
              <>
                <ProjectChatComposer groupId={id} groupName={group.name} solo={!hasOthers} />
                <ProjectChatList groupId={id} />
              </>
            ) : null}
            {!isSystem && id ? <ProjectInstructionsCard groupId={id} /> : null}
            {feedQuery.isPending ? (
              <SkeletonRows count={3} leading={44} />
            ) : feedQuery.isError ? (
              <Pressable onPress={() => void feedQuery.refetch()} accessibilityRole="button">
                <Text style={[styles.emptyLine, { color: colors.semantic.error }]}>
                  Inhalte konnten nicht geladen werden. Tippen zum Wiederholen.
                </Text>
              </Pressable>
            ) : (
              <ProjectKnowledgeList
                items={knowledge}
                onOpen={open}
                shareActions={shareActions}
                onDiscuss={onDiscuss}
              />
            )}
            <ProjectLinks links={group.links ?? []} />
            {isTeam ? (
              <ProjectMembersPreview
                members={members}
                onShowAll={() =>
                  router.push({
                    pathname: '/(focused)/projekte/[id]/info',
                    params: { id: id ?? '' },
                  })
                }
              />
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.padded}>
              {canPost ? (
                <PostComposerRow
                  userName={userName}
                  onPress={writePost}
                  placeholder="Schreib etwas an das Projekt …"
                />
              ) : null}
            </View>

            {feedQuery.isPending ? (
              <View style={styles.padded}>
                <SkeletonRows count={3} leading={44} />
              </View>
            ) : feedQuery.isError ? (
              <Text style={[styles.emptyLine, { color: colors.semantic.error }]}>
                Inhalte konnten nicht geladen werden.
              </Text>
            ) : visible.length === 0 ? (
              <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>{emptyText}</Text>
            ) : (
              <View
                style={styles.padded}
                onLayout={(e) => {
                  focus.current.listY = e.nativeEvent.layout.y;
                  scrollToFocus();
                }}
              >
                {visible.map((item) => (
                  <View
                    key={item.key}
                    onLayout={(e) => {
                      if (!focusShareId || item.share?.shareId !== focusShareId) return;
                      focus.current.cardY = e.nativeEvent.layout.y;
                      scrollToFocus();
                    }}
                  >
                    <GroupFeedCard
                      item={item}
                      groupId={id ?? ''}
                      token={token}
                      canComment
                      shareActions={shareActions}
                      onOpen={open}
                      onShowComments={setCommentsFor}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {activeView === 'austausch' ? (
        searchOpen ? (
          <KeyboardStickyView
            offset={{ closed: 0, opened: Math.max(insets.bottom, spacing.medium) - spacing.small }}
            style={[styles.searchDock, { bottom: Math.max(insets.bottom, spacing.medium) }]}
          >
            <View style={[styles.search, { backgroundColor: theme.card }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                placeholder="Im Austausch suchen"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Im Austausch suchen"
                style={[styles.searchInput, { color: theme.text }]}
                returnKeyType="search"
              />
              <Pressable
                onPress={closeSearch}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Suche schließen"
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </KeyboardStickyView>
        ) : (
          <Fab
            icon="search"
            accessibilityLabel="Im Austausch suchen"
            onPress={() => setSearchOpen(true)}
            style={{
              backgroundColor: tone.accent,
              bottom: Math.max(insets.bottom, spacing.medium),
            }}
          />
        )
      ) : null}

      <MenuActionSheet
        visible={addOpen}
        theme={theme}
        heading="Zum Projekt hinzufügen"
        actions={addMenu}
        onSelect={addActions.run}
        onClose={() => setAddOpen(false)}
      />
      {id ? (
        <GroupCommentsSheet
          groupId={id}
          item={commentsFor}
          isAdmin={isAdmin}
          isSystem={isSystem}
          onClose={() => setCommentsFor(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Reading measure on a tablet; a phone is narrower than the cap anyway.
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scrollContent: { paddingBottom: spacing.xxlarge * 2, gap: 14 },
  padded: { paddingHorizontal: spacing.medium, gap: 14 },
  skeletonHead: { paddingHorizontal: spacing.medium, paddingTop: spacing.medium },
  headerActions: { flexDirection: 'row', gap: spacing.xsmall },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchDock: {
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
    alignItems: 'center',
  },
  search: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  searchInput: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, height: 48 },
  emptyLine: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: spacing.large,
    paddingTop: spacing.large,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.large,
  },
  centeredText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
