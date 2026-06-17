import { View, StyleSheet } from 'react-native';

import { getResearchCollectionIds } from '../../config/notebooksConfig';
import { spacing } from '../../theme';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection } from './NotebookAgentsSection';
import { StatisticsSection } from './StatisticsSection';

import type { Theme } from '../../theme/colors';

/**
 * The notebook "hub" shown before the user runs a search — the mobile analog of web's
 * notebook startpage sections: Landesverband agents, recent documents, and statistics.
 * Each section self-hides when it has no data, so Bundes notebooks show stats/recent
 * without an agents block, and user notebooks (no system collections) render nothing.
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
  const collectionIds = kind === 'system' ? getResearchCollectionIds(notebookId) : [];

  return (
    <View style={styles.container}>
      <NotebookAgentsSection notebookId={notebookId} theme={theme} />
      <LastAddedSection collectionIds={collectionIds} theme={theme} />
      <StatisticsSection collectionIds={collectionIds} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.large,
    paddingTop: spacing.small,
    paddingBottom: spacing.large,
  },
});
