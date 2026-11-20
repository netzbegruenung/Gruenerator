import { canShareIntoGroup, filterGroupFeed, type GroupFeedItem } from '@gruenerator/shared/groups';
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

import { MenuActionSheet } from '../../../../components/chat/MenuActionSheet';
import { SkeletonBar, SkeletonGroup, SkeletonRows } from '../../../../components/common';
import { NeutralBackdrop } from '../../../../components/common/NeutralBackdrop';
import { SegmentedControl } from '../../../../components/common/SegmentedControl';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { buildAddActions } from '../../../../components/projekte/addMenu';
import { GroupCommentsSheet } from '../../../../components/projekte/GroupCommentsSheet';
import { GroupFeedCard } from '../../../../components/projekte/GroupFeedCard';
import { GroupKindRows } from '../../../../components/projekte/GroupKindRows';
import { PostComposerRow } from '../../../../components/projekte/PostComposerRow';
import { canWritePost } from '../../../../components/projekte/postRules';
import { ProjectChatComposer } from '../../../../components/projekte/ProjectChatComposer';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import { openGroupFeedItem, useBearerToken, useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails } from '../../../../hooks/useGroups';
import { useHiddenMemberIds } from '../../../../hooks/useHiddenMembers';
import { useProjectAddActions } from '../../../../hooks/useProjectAddActions';
import { useShareItemActions } from '../../../../hooks/useShareItemActions';
import { useTheme } from '../../../../hooks/useTheme';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../../theme/layout';
import { filterHiddenFeed } from '../../../../utils/hiddenMembers';
import { goBackOr } from '../../../../utils/navigation';

type ViewMode = 'feed' | 'all';

/**
 * Ein Projekt bzw. eine Gruppe. Feed (neueste Freigaben, Angeheftetes oben)
 * und „Alle" (eine Reihe je Art). Mitglieder, Links und Beschreibung stehen
 * hinter dem Personen-Symbol auf der Info-Seite; über „+“ legt man eigene
 * Inhalte hinein. Wer geteilt hat (oder Admin ist), ändert über „…“ bzw. langes
 * Drücken die Rolle, die Notiz oder die Freigabe; Admins heften an. Eigene Beiträge
 * schreibt man über die Zeile oben im Feed bzw. „+“; die übrige Verwaltung bleibt dem Web.
 */
export default function ProjektDetailScreen() {
  // `beitrag`: aus einer Benachrichtigung — zu diesem Beitrag scrollen.
  const { id, beitrag } = useLocalSearchParams<{ id: string; beitrag?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();

  const detailsQuery = useGroupDetails(id);
  const feedQuery = useGroupFeed(id);
  const token = useBearerToken();
  const group = detailsQuery.data?.group;
  const isPersonal = group?.group_type === 'personal';
  // Wie im Web: ins System-Projekt teilen nur Instanz-Admins.
  const isAdmin = !!detailsQuery.data?.membership.isAdmin;
  const canAdd = !!group && canShareIntoGroup({ is_system: group.is_system, isAdmin });
  const shareActions = useShareItemActions(id ?? null, isAdmin, !isPersonal);
  const addActions = useProjectAddActions(id ?? null);
  const userName = useAuthStore((s) => s.user?.display_name ?? null);
  const canPost = !!group && canWritePost(group, isAdmin);
  const addMenu = useMemo(() => buildAddActions(canPost), [canPost]);
  const writePost = () =>
    router.push({ pathname: '/(focused)/projekte/[id]/beitrag', params: { id: id ?? '' } });

  const [view, setView] = useState<ViewMode>('feed');
  const [query, setQuery] = useState('');
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

  const activeView: ViewMode = isPersonal ? 'all' : view;
  const hiddenIds = useHiddenMemberIds();
  const items = useMemo(
    () => filterHiddenFeed(feedQuery.data ?? [], hiddenIds),
    [feedQuery.data, hiddenIds]
  );
  const visible = filterGroupFeed(items, query);
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
            accessibilityLabel={isPersonal ? 'Projekt-Info anzeigen' : 'Gruppen-Info anzeigen'}
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
    ? `Kein Inhalt passt zu „${query.trim()}“.`
    : isPersonal
      ? 'In diesem Projekt liegt noch nichts.'
      : 'Noch nichts geteilt.';

  return scaffold(
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={() => {
              void detailsQuery.refetch();
              void feedQuery.refetch();
            }}
          />
        }
      >
        <View style={styles.padded}>
          {id ? (
            <ProjectChatComposer
              groupId={id}
              groupName={group.name}
              solo={isPersonal || group.is_system === true}
            />
          ) : null}
          {!isPersonal && (
            <SegmentedControl
              accessibilityLabel="Ansicht"
              activeColor={tone.accent}
              value={activeView}
              onChange={(v) => setView(v as ViewMode)}
              options={[
                { value: 'feed', label: 'Feed', short: 'Feed', disabled: false },
                {
                  value: 'all',
                  label: `Alle, ${items.length} Inhalte`,
                  short: `Alle · ${items.length}`,
                  disabled: false,
                },
              ]}
            />
          )}
          {canPost && activeView === 'feed' ? (
            <PostComposerRow userName={userName} onPress={writePost} />
          ) : null}
          <View style={[styles.search, { backgroundColor: theme.buttonBackground }]}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={isPersonal ? 'Im Projekt suchen' : 'In der Gruppe suchen'}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={isPersonal ? 'Im Projekt suchen' : 'In der Gruppe suchen'}
              style={[styles.searchInput, { color: theme.text }]}
              returnKeyType="search"
            />
          </View>
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
        ) : activeView === 'feed' ? (
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
                  if (!beitrag || item.share?.shareId !== beitrag) return;
                  focus.current.cardY = e.nativeEvent.layout.y;
                  scrollToFocus();
                }}
              >
                <GroupFeedCard
                  item={item}
                  groupId={id ?? ''}
                  token={token}
                  canComment={!isPersonal}
                  shareActions={shareActions}
                  onOpen={open}
                  onShowComments={setCommentsFor}
                />
              </View>
            ))}
          </View>
        ) : (
          <GroupKindRows
            items={visible}
            showPinned={!query.trim()}
            onOpen={open}
            shareActions={shareActions}
          />
        )}
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
          isSystem={group.is_system === true}
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
  search: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
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
