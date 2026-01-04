import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubtitleEditorScreen } from '../../components/subtitle-editor';
import { lightTheme, darkTheme, colors } from '../../theme';
import type { Project } from '@gruenerator/shared';

export default function FullscreenSubtitleEditor() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ projectId: string; projectData: string }>();

  const project: Project | null = params.projectData
    ? JSON.parse(params.projectData)
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
      <SubtitleEditorScreen
        project={project}
        onBack={handleClose}
        onSaved={handleClose}
      />
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
