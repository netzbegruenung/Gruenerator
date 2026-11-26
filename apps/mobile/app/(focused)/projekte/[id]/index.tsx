import {
  austauschItems,
  canShareIntoGroup,
  filterGroupFeed,
  hasAustauschContent,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
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

import { MenuActionSheet } from '../../../../components/chat/MenuActionSheet';
import { SkeletonBar, SkeletonGroup, SkeletonRows } from '../../../../components/common';
import { NeutralBackdrop } from '../../../../components/common/NeutralBackdrop';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { buildAddActions } from '../../../../components/projekte/addMenu';
import { GroupCommentsSheet } from '../../../../components/projekte/GroupCommentsSheet';
import { GroupFeedCard } from '../../../../components/projekte/GroupFeedCard';
import { knowledgeItems, recipeItems } from '../../../../components/projekte/knowledgeMenu';
import { canWritePost } from '../../../../components/projekte/postRules';
import { ProjectChatComposer } from '../../../../components/projekte/ProjectChatComposer';
import { ProjectCloudSourcesCard } from '../../../../components/projekte/ProjectCloudSourcesCard';
import { ProjectInstructionsCard } from '../../../../components/projekte/ProjectInstructionsCard';
import { ProjectKnowledgeList } from '../../../../components/projekte/ProjectKnowledgeList';
import { ProjectLinks } from '../../../../components/projekte/ProjectLinks';
import { ProjectMembersPreview } from '../../../../components/projekte/ProjectMembersPreview';
import { ProjectRecipesCard } from '../../../../components/projekte/ProjectRecipesCard';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import { openGroupFeedItem, useBearerToken, useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import { useHiddenMemberIds } from '../../../../hooks/useHiddenMembers';
import { useRecordItemUsage } from '../../../../hooks/useItemUsage';
import { useProjectAddActions } from '../../../../hooks/useProjectAddActions';
import { useProjectChats } from '../../../../hooks/useProjectChats';
import { useShareItemActions } from '../../../../hooks/useShareItemActions';
import { useTheme } from '../../../../hooks/useTheme';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../../theme/layout';
import { filterHiddenFeed } from '../../../../utils/hiddenMembers';
import { goBackOr } from '../../../../utils/navigation';

/**
 * Ein Projekt, eine Seite ohne Reiter (wie im Web): oben der neue Chat und die
 * bisherigen Chats, darunter der Austausch (Beiträge und Freigaben, über die
 * gesprochen wird — Angeheftetes oben), dann Anweisungen, Rezepte, Wissen, Links und
 * Mitglieder. Über „+“ im Kopf legt man Inhalte hinein, über „+“ im Austausch
 * schreibt man einen Beitrag. Wer geteilt hat (oder Admin ist), ändert über
 * „…“ bzw. langes Drücken die Rolle, die Notiz oder die Freigabe; Admins heften
 * an. Die übrige Verwaltung bleibt dem Web.
 */
export default function ProjektDetailScreen() {
  // `beitrag`: aus einer Benachrichtigung — zu diesem Beitrag scrollen.
  const { id, beitrag } = useLocalSearchParams<{ id: string; beitrag?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();

  const detailsQuery = useGroupDetails(id);
  // Öffnen zählt als Nutzung für „Zuletzt“ und „Empfohlen“ (Chats im Projekt zählt der Server).
  useRecordItemUsage('project', detailsQuery.data?.group.id ?? null);
  const feedQuery = useGroupFeed(id);
  const membersQuery = useGroupMembers(id);
  const token = useBearerToken();
  const group = detailsQuery.data?.group;
  const isSystem = group?.is_system === true;
  // Ein Projekt ist allein oder mit anderen nutzbar, unabhängig vom gespeicherten
  // `group_type`: Austausch und „Für das Team“ erscheinen erst, wenn jemand dabei ist.
  const hasOthers = isSystem || (membersQuery.data?.length ?? 0) > 1;
  // Der Austausch bleibt sichtbar, solange es Beiträge gibt — auch wenn nur noch eine Person im Projekt ist.
  const hasAustausch = hasOthers || hasAustauschContent(feedQuery.data ?? []);
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
  const canPost = !!group && canWritePost(group, isAdmin);
  const addMenu = useMemo(() => buildAddActions(canPost), [canPost]);
  const writePost = () =>
    router.push({ pathname: '/(focused)/projekte/[id]/beitrag', params: { id: id ?? '' } });

  // Wissen-Einträge, die jemand aus der Liste in den Austausch geholt hat.
  const [discussed, setDiscussed] = useState<ReadonlySet<string>>(new Set());
  const [focusShareId, setFocusShareId] = useState<string | null>(beitrag ?? null);
  const [query, setQuery] = useState('');
  // Die Suche öffnet die Lupe im Kopf des Austauschs, kein stehendes Feld.
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
  const recipes = useMemo(() => recipeItems(items), [items]);
  const members = membersQuery.data ?? [];
  const showChats = canAdd && !isSystem;
  const chatsQuery = useProjectChats(id, showChats);
  const onDiscuss = !hasAustausch
    ? null
    : (item: GroupFeedItem) => {
        const shareId = item.share?.shareId;
        if (!shareId) return;
        setDiscussed((prev) => new Set(prev).add(shareId));
        setFocusShareId(shareId);
        closeSearch();
        // Die Liste steht schon; nur die Karte meldet ihre Lage neu.
        focus.current = { ...focus.current, cardY: null, done: false };
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
        {showChats && id ? (
          <View style={styles.padded}>
            <ProjectChatComposer groupId={id} groupName={group.name} />
          </View>
        ) : null}

        {hasAustausch ? (
          <>
            <View style={styles.padded}>
              <View style={styles.sectionHead}>
                <Text
                  style={[styles.sectionTitle, { color: theme.text }]}
                  accessibilityRole="header"
                >
                  Austausch
                </Text>
                <Pressable
                  onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={searchOpen ? 'Suche schließen' : 'Im Austausch suchen'}
                  style={styles.sectionButton}
                >
                  <Ionicons
                    name={searchOpen ? 'close' : 'search'}
                    size={20}
                    color={theme.textSecondary}
                  />
                </Pressable>
                {canPost ? (
                  <Pressable
                    onPress={writePost}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Neuer Beitrag"
                    style={styles.sectionButton}
                  >
                    <Ionicons name="add" size={24} color={theme.text} />
                  </Pressable>
                ) : null}
              </View>
              {searchOpen ? (
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
                </View>
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
        ) : null}

        <View style={styles.padded}>
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
            <>
              {/* Im System-Projekt nur, wenn es etwas zu zeigen oder anzulegen gibt (wie im Web). */}
              {id && (!isSystem || canAdd || recipes.length > 0) ? (
                <ProjectRecipesCard
                  groupId={id}
                  items={recipes}
                  canAdd={canAdd}
                  landesverband={group.landesverband ?? null}
                  onOpen={open}
                  shareActions={shareActions}
                  onDiscuss={onDiscuss}
                />
              ) : null}
              <ProjectKnowledgeList
                items={knowledge}
                onOpen={open}
                shareActions={shareActions}
                onDiscuss={onDiscuss}
              />
            </>
          )}
          {!isSystem && id ? (
            <ProjectCloudSourcesCard
              groupId={id}
              isAdmin={isAdmin}
              archived={!!group.archived_at}
            />
          ) : null}
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
      </ScrollView>

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
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  sectionTitle: { flex: 1, fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  sectionButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  search: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, height: 44 },
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
