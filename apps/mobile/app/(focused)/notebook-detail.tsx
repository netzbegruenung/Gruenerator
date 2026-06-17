import { useAgentStore } from '@gruenerator/chat';
import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotebookResearchPanel } from '../../components/notebook/NotebookResearchPanel';
import { colors, lightTheme, darkTheme } from '../../theme';

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

  // Prime the global agent store with the notebook's default (LV) agent, the way
  // web's notebook page does — so a hop into chat keeps the regional agent. Reset
  // on unmount to avoid the agent bleeding into an unrelated conversation.
  useEffect(() => {
    const defaultAgent = NOTEBOOK_REGISTRY.find((nb) => nb.id === notebookId)?.defaultAgent;
    if (!defaultAgent) return;
    useAgentStore.getState().setSelectedAgent(defaultAgent);
    return () => {
      useAgentStore.getState().setSelectedAgent(null);
    };
  }, [notebookId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* App gradient behind the whole screen — full immersion, matching start.
          No back button; swipe-back is handled by the focused-stack gesture. */}
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.white, 'rgba(95, 133, 117, 0.05)']
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <NotebookResearchPanel
        notebookId={notebookId}
        kind={notebookKind}
        theme={theme}
        notebookTitle={displayTitle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
