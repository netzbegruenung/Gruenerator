import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    projectData: string;
    openShare?: string;
  }>();

  // Clear editor state on unmount so a later session can't observe a
  // previous project's state if its load path skips loadProject().
  useEffect(() => {
    return () => {
      useSubtitleEditorStore.getState().reset();
    };
  }, []);

  const project: Project | null = params.projectData
    ? (JSON.parse(params.projectData) as Project)
    : null;

  if (!project) {
    router.back();
    return null;
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
