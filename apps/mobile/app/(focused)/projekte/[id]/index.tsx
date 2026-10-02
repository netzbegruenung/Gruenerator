import { filterGroupFeed, type GroupFeedItem } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
} from 'react-native';

import { SkeletonBar, SkeletonGroup, SkeletonRows } from '../../../../components/common';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { GroupCommentsSheet } from '../../../../components/projekte/GroupCommentsSheet';
import { GroupFeedCard } from '../../../../components/projekte/GroupFeedCard';
import { GroupKindRows } from '../../../../components/projekte/GroupKindRows';
import { openGroupFeedItem, useBearerToken, useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails } from '../../../../hooks/useGroups';
import { useTheme } from '../../../../hooks/useTheme';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../../../theme';
import { goBackOr } from '../../../../utils/navigation';

type ViewMode = 'feed' | 'all';

/**
 * Ein Projekt bzw. eine Gruppe — in der App nur zum Lesen. Feed (neueste
 * Freigaben, Angeheftetes oben) und „Alle" (eine Reihe je Art). Mitglieder,
 * Links und Beschreibung stehen hinter dem Personen-Symbol auf der Info-Seite;
 * Teilen, Anheften und Kommentieren bleiben dem Web.
 */
export default function ProjektDetailScreen() {
  // `beitrag`: aus einer Benachrichtigung — zu diesem Beitrag scrollen.
  const { id, beitrag } = useLocalSearchParams<{ id: string; beitrag?: string }>();
  const router = useRouter();
  const theme = useTheme();

  const detailsQuery = useGroupDetails(id);
  const feedQuery = useGroupFeed(id);
  const token = useBearerToken();
  const group = detailsQuery.data?.group;
  const isPersonal = group?.group_type === 'personal';

  const [view, setView] = useState<ViewMode>('feed');
  const [query, setQuery] = useState('');
  const [commentsFor, setCommentsFor] = useState<GroupFeedItem | null>(null);
  const scrollRef = useRef<ScrollView>(null);
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
  const items = feedQuery.data ?? [];
  const visible = filterGroupFeed(items, query);
  const open = useCallback((item: GroupFeedItem) => openGroupFeedItem(router, item), [router]);

  const scaffold = (children: ReactNode): ReactNode => (
    <ScreenScaffold
      title={group?.name ?? 'Projekt'}
      onBack={() => goBackOr('/(focused)/projekte')}
      headerRight={
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
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  const segment = (key: ViewMode, label: string) => {
    const selected = activeView === key;
    return (
      <Pressable
        key={key}
        onPress={() => setView(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={[styles.segment, selected && [styles.segmentOn, { backgroundColor: theme.card }]]}
      >
        <Text
          style={[
            styles.segmentText,
            { color: selected ? theme.text : theme.textSecondary },
            selected && styles.segmentTextOn,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const emptyText = query.trim()
    ? `Kein Inhalt passt zu „${query.trim()}“.`
    : isPersonal
      ? 'In diesem Projekt liegt noch nichts.'
      : 'Noch nichts geteilt.';

  return scaffold(
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
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
          {!isPersonal && (
            <View
              accessibilityRole="tablist"
              style={[styles.segmented, { backgroundColor: theme.buttonBackground }]}
            >
              {segment('feed', 'Feed')}
              {segment('all', `Alle · ${items.length}`)}
            </View>
          )}
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
                  onOpen={open}
                  onShowComments={setCommentsFor}
                />
              </View>
            ))}
          </View>
        ) : (
          <GroupKindRows items={visible} showPinned={!query.trim()} onOpen={open} />
        )}
      </ScrollView>

      {id ? (
        <GroupCommentsSheet groupId={id} item={commentsFor} onClose={() => setCommentsFor(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xxlarge * 2, gap: 14 },
  padded: { paddingHorizontal: spacing.medium, gap: 14 },
  skeletonHead: { paddingHorizontal: spacing.medium, paddingTop: spacing.medium },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: 12 },
  segment: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentOn: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontFamily: BODY_FONT, fontSize: 15 },
  segmentTextOn: { fontWeight: '700' },
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
