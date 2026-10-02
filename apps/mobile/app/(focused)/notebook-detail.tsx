import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '../../components/common/BackButton';
import { NotebookGradientBackground } from '../../components/common/NotebookGradientBackground';
import { GlassTopTabs } from '../../components/navigation/WorkplaceTopTabs';
import { NotebookOverview } from '../../components/notebook/NotebookOverview';
import { NotebookResearchPanel } from '../../components/notebook/NotebookResearchPanel';
import { colors, lightTheme, darkTheme, spacing } from '../../theme';

/** Web's `NotebookTabs`: asking and searching on one page, everything else
 *  about the notebook (statistics, people, recent documents) on the other. */
const NOTEBOOK_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'uebersicht', label: 'Übersicht' },
] as const;
type NotebookTab = (typeof NOTEBOOK_TABS)[number]['id'];

export default function NotebookDetailScreen() {
  const { notebookId, title, kind } = useLocalSearchParams<{
    notebookId: string;
    title?: string;
    kind: 'system' | 'user';
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const notebookKind: 'system' | 'user' = kind === 'user' ? 'user' : 'system';
  // Prefer the passed title; fall back to the registry name so the greeting always
  // shows the real notebook (e.g. deep links omit the param).
  const displayTitle =
    title || NOTEBOOK_REGISTRY.find((nb) => nb.id === notebookId)?.title || 'Notebook';

  // Only a system notebook has an overview; a user notebook keeps the one page.
  const hasOverview = notebookKind === 'system';
  const [tab, setTab] = useState<NotebookTab>('chat');
  const progress = useSharedValue(0);
  const selectTab = (index: number) => {
    setTab(NOTEBOOK_TABS[index]?.id ?? 'chat');
    progress.set(withTiming(index, { duration: 220 }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* The notebook's signature magenta, same as the Wissen gallery and web's
          NOTEBOOK_MAGENTA_BG — a notebook keeps its colour when you open it. */}
      <NotebookGradientBackground />
      {/* A row of its own rather than floating: the back button used to sit on
          top of the greeting once it scrolled under it. */}
      <View style={styles.topRow}>
        <BackButton
          color={colorScheme === 'dark' ? colors.grey[200] : colors.grey[800]}
          background={colorScheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)'}
          style={styles.backButton}
        />
        {hasOverview && (
          <View style={styles.tabs} pointerEvents="box-none">
            <GlassTopTabs
              tabs={NOTEBOOK_TABS}
              progress={progress}
              active={tab}
              onSelect={selectTab}
            />
          </View>
        )}
      </View>
      {/* Stays mounted on the Übersicht tab, so the typed text and the hits
          are still there on the way back. */}
      <View style={[styles.container, tab !== 'chat' && styles.hidden]}>
        <NotebookResearchPanel
          notebookId={notebookId}
          kind={notebookKind}
          theme={theme}
          notebookTitle={displayTitle}
        />
      </View>
      {hasOverview && tab === 'uebersicht' && (
        <ScrollView style={styles.container} contentContainerStyle={styles.overviewContent}>
          <NotebookOverview notebookId={notebookId} kind={notebookKind} theme={theme} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  topRow: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
  },
  // The button floats by default; here it sits in the row (the SafeAreaView
  // already keeps the row clear of the status bar).
  backButton: {
    position: 'relative',
    top: 0,
    left: 0,
  },
  tabs: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewContent: {
    paddingBottom: spacing.xxlarge,
  },
});
