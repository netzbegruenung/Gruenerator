import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { getResearchCollectionIds } from '../../config/notebooksConfig';
import { useNotebookOverview } from '../../hooks/notebook/useNotebookOverview';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';
import { spacing, borderRadius, BODY_FONT } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';
import { routeWithParams } from '../../types/routes';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection } from './NotebookAgentsSection';
import {
  ActivityChart,
  InstagramPosts,
  OverviewKpis,
  PeopleList,
  RecentDocuments,
  SourceMix,
  TermCloud,
  TopicProfile,
  type OverviewTone,
} from './OverviewSections';

import type { Theme } from '../../theme/colors';
import type { TopicCategory } from '@gruenerator/contracts';

function LoadingState({ theme }: { theme: Theme }) {
  return (
    <View accessible accessibilityLabel="Übersicht wird geladen" style={styles.sections}>
      <View style={styles.skeletonGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <SkeletonGroup on="card" style={styles.skeletonInner}>
              <SkeletonBar width="55%" height={11} />
              <SkeletonBar width="72%" height={20} radius={5} />
            </SkeletonGroup>
          </View>
        ))}
      </View>
      <SkeletonBar height={160} radius={borderRadius.large} />
    </View>
  );
}

/**
 * One collection's overview — the web Übersicht's sections, fed by the same
 * contracted endpoint and in the same order.
 */
function CollectionOverview({
  notebookId,
  collectionId,
  tone,
}: {
  notebookId: string;
  collectionId: string;
  tone: OverviewTone;
}) {
  const router = useRouter();
  const { data: overview, isPending, isError, refetch } = useNotebookOverview(collectionId);
  const { theme } = tone;

  // Like web: clear the notebook's facets, set exactly this topic, switch to the
  // chat — the notebook chat reads its facets from the same store.
  const selectTopic = useCallback(
    (topic: TopicCategory) => {
      const store = useNotebookFilterStore.getState();
      store.setNotebook(notebookId);
      store.selectOnlyValue('themes', topic);
      router.push(routeWithParams('/(focused)/notebook-chat', { notebookId }));
    },
    [notebookId, router]
  );

  if (isPending) return <LoadingState theme={theme} />;

  if (isError) {
    return (
      <View
        style={[styles.message, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        <Text style={[styles.messageText, { color: theme.text }]}>
          Die Übersicht konnte nicht geladen werden.
        </Text>
        <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={6}>
          <Text style={[styles.retry, { color: tone.accent }]}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  if (overview.totals.documents === 0) {
    return (
      <View
        style={[styles.message, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        <Text style={[styles.messageText, { color: theme.textSecondary }]}>
          Für dieses Notebook liegen noch keine Dokumente vor.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.sections}>
      <OverviewKpis overview={overview} tone={tone} />
      {overview.monthly.some((m) => m.count > 0) && (
        <ActivityChart overview={overview} tone={tone} />
      )}
      {overview.topics.length > 0 && (
        <TopicProfile overview={overview} tone={tone} onSelectTopic={selectTopic} />
      )}
      {overview.persons.length > 0 && <PeopleList overview={overview} tone={tone} />}
      {overview.recent.length > 0 && <RecentDocuments overview={overview} tone={tone} />}
      {overview.instagram.length > 0 && <InstagramPosts posts={overview.instagram} tone={tone} />}
      {(overview.contentTypes.length > 1 || overview.sources.length > 1) && (
        <SourceMix overview={overview} tone={tone} />
      )}
      {overview.terms && (
        <TermCloud terms={overview.terms} documents={overview.totals.documents} tone={tone} />
      )}
    </View>
  );
}

/**
 * The notebook "hub" shown before the user runs a search. A single-collection
 * system notebook gets web's Übersicht; web has none for a multi-collection
 * notebook (the endpoint takes one collection), so that one keeps the recent
 * documents across its collections. The notebook's Agents close it, as on web.
 */
export function NotebookOverview({
  notebookId,
  kind,
  theme,
}: {
  notebookId: string;
  kind: 'system' | 'user';
  theme: Theme;
}) {
  const isDark = useColorScheme() === 'dark';
  const collectionIds = kind === 'system' ? getResearchCollectionIds(notebookId) : [];
  // The notebook surface is magenta end to end — the app green read as a stray
  // accent on it.
  const tone: OverviewTone = { theme, accent: getSurfaceFab('wissen', isDark).icon };

  return (
    <View style={styles.container}>
      {collectionIds.length === 1 ? (
        <CollectionOverview notebookId={notebookId} collectionId={collectionIds[0]} tone={tone} />
      ) : (
        <LastAddedSection collectionIds={collectionIds} theme={theme} />
      )}
      <NotebookAgentsSection notebookId={notebookId} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.large,
    paddingTop: spacing.small,
    paddingBottom: spacing.large,
  },
  sections: {
    gap: spacing.medium,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  skeletonCard: {
    flexBasis: '47%',
    flexGrow: 1,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  skeletonInner: {
    gap: spacing.xxsmall,
  },
  message: {
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.large,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  messageText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    textAlign: 'center',
  },
  retry: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
