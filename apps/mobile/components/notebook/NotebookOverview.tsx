import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { getResearchCollectionIds } from '../../config/notebooksConfig';
import { colors, spacing } from '../../theme';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection } from './NotebookAgentsSection';
import { StatisticsSection } from './StatisticsSection';

import type { Theme } from '../../theme/colors';

/**
 * The notebook "hub" shown before the user runs a search — recent documents and
 * statistics, collapsed behind a "Mehr anzeigen" toggle to keep the Recherche
 * landing minimal. Each section self-hides when it has no data; the notebook's
 * Landesverband agents live in their own "Agenten" tab, not here.
 */
export function NotebookOverview({
  notebookId,
  kind,
  theme,
  onGreen,
}: {
  notebookId: string;
  kind: 'system' | 'user';
  theme: Theme;
  onGreen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const collectionIds = kind === 'system' ? getResearchCollectionIds(notebookId) : [];
  const accent = onGreen ? colors.white : theme.textGreen;

  return (
    <View style={styles.container}>
      <NotebookAgentsSection notebookId={notebookId} theme={theme} onGreen={onGreen} />

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.toggle}
        hitSlop={6}
        accessibilityRole="button"
      >
        <Text style={[styles.toggleText, { color: accent }]}>
          {expanded ? 'Statistiken ausblenden' : 'Statistiken'}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={accent} />
      </Pressable>

      {expanded && (
        <>
          <LastAddedSection collectionIds={collectionIds} theme={theme} />
          <StatisticsSection collectionIds={collectionIds} theme={theme} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.large,
    paddingTop: spacing.small,
    paddingBottom: spacing.large,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
