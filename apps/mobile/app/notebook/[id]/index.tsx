import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { NotebookGradientBackground } from '../../../components/common/NotebookGradientBackground';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { GlassTopTabs } from '../../../components/navigation/WorkplaceTopTabs';
import { AllNotebooksSearchSheet } from '../../../components/notebook/AllNotebooksSearchSheet';
import { NotebookOverview } from '../../../components/notebook/NotebookOverview';
import { NotebookResearchPanel } from '../../../components/notebook/NotebookResearchPanel';
import { notebookKindOf } from '../../../config/notebooksConfig';
import { lightTheme, darkTheme, spacing } from '../../../theme';
import { route } from '../../../types/routes';
import { goBackOr } from '../../../utils/navigation';

/** Web's `NotebookTabs`: asking and searching on one page, everything else
 *  about the notebook (statistics, people, recent documents) on the other. */
const NOTEBOOK_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'uebersicht', label: 'Übersicht' },
] as const;
type NotebookTab = (typeof NOTEBOOK_TABS)[number]['id'];

/**
 * A notebook — the workplace's Chat | Arbeiten shell in the notebook's
 * magenta: the same scaffold and pill on top, the same docked composer.
 */
export default function NotebookDetailScreen() {
  const { id: notebookId, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // Derived, not passed: a deep link or a stored thread knows only the id, and
  // a user notebook's UUID must not get the system notebook's overview.
  const notebookKind = notebookKindOf(notebookId);
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
  const [allSearchVisible, setAllSearchVisible] = useState(false);

  return (
    <ScreenScaffold
      title={displayTitle}
      {...(hasOverview && {
        titleNode: (
          <GlassTopTabs
            tabs={NOTEBOOK_TABS}
            progress={progress}
            active={tab}
            onSelect={selectTab}
          />
        ),
      })}
      // A cold link opens the notebook with nothing beneath it; Wissen is where
      // a notebook is opened from.
      onBack={() => goBackOr(route('/(focused)/wissen'))}
      // Like web's Wissen composer: sources from every notebook at once.
      headerRight={
        <Pressable
          onPress={() => setAllSearchVisible(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Alle Notebooks durchsuchen"
          style={styles.headerButton}
        >
          <Ionicons name="search" size={22} color={theme.text} />
        </Pressable>
      }
      // The notebook's signature magenta, same as the Wissen gallery and web's
      // NOTEBOOK_MAGENTA_BG — a notebook keeps its colour when you open it.
      backdrop={<NotebookGradientBackground />}
    >
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
      <AllNotebooksSearchSheet
        visible={allSearchVisible}
        onClose={() => setAllSearchVisible(false)}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewContent: {
    paddingBottom: spacing.xxlarge,
  },
});
