import { getProject } from '@gruenerator/shared';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseLoader } from '../../components/common';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { SubtitleEditorScreen } from '../../components/subtitle-editor';
import { useSubtitleEditorStore } from '../../stores/subtitleEditorStore';
import { lightTheme, darkTheme, colors } from '../../theme';

import type { Project } from '@gruenerator/shared';

export default function FullscreenSubtitleEditor() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    projectId: string;
    projectData?: string;
    openShare?: string;
  }>();

  // Clear editor state on unmount so a later session can't observe a
  // previous project's state if its load path skips loadProject().
  useEffect(() => {
    return () => {
      useSubtitleEditorStore.getState().reset();
    };
  }, []);

  // Two ways in: the reel tool pushes the full project as `projectData`; the
  // Studio tab's media grid only has the id and lets this screen fetch. Without
  // the id path, Studio reels had nowhere native to open and fell back to the
  // browser.
  const [project, setProject] = useState<Project | null>(() =>
    params.projectData ? (JSON.parse(params.projectData) as Project) : null
  );
  const [loadFailed, setLoadFailed] = useState(false);

  const needsFetch = !project && !!params.projectId;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    getProject(params.projectId)
      .then((loaded) => {
        if (!cancelled) setProject(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, params.projectId]);

  const unopenable = loadFailed || (!project && !params.projectId);
  useEffect(() => {
    if (unopenable) router.back();
  }, [unopenable]);

  if (unopenable) {
    return null;
  }

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <PulseLoader
          title="Reel wird geladen..."
          icon="videocam-outline"
          onCancel={() => router.back()}
        />
      </View>
    );
  }

  const handleClose = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ErrorBoundary>
        <SubtitleEditorScreen
          project={project}
          onBack={handleClose}
          onSaved={handleClose}
          initialShowShare={params.openShare === '1'}
        />
      </ErrorBoundary>
      <Pressable
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={handleClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Untertitel-Editor schließen"
      >
        <Ionicons name="close" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
