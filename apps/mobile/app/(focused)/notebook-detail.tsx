import { useAgentStore } from '@gruenerator/chat';
import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '../../components/common/BackButton';
import { NotebookGradientBackground } from '../../components/common/NotebookGradientBackground';
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
      {/* The notebook's signature magenta, same as the Wissen gallery and web's
          NOTEBOOK_MAGENTA_BG — a notebook keeps its colour when you open it. */}
      <NotebookGradientBackground />
      <BackButton
        color={colorScheme === 'dark' ? colors.grey[200] : colors.grey[800]}
        background={colorScheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)'}
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
