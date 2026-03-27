import { type Project, getVideoUrl, useProjectsStore } from '@gruenerator/shared';
import { kiTypeRequiresImage, typeHasTextGeneration } from '@gruenerator/shared/image-studio';
import { Ionicons } from '@expo/vector-icons';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypeSelector } from '../../../components/image-studio/TypeSelector';
import { ProjectList } from '../../../components/reel';
import { shareService } from '../../../services/share';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

import type {
  ImageStudioKiType,
  ImageStudioTemplateType,
  KiStyleVariant,
} from '@gruenerator/shared/image-studio';

export default function MediaDashboard() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setKiType, setKiVariant, setType, reset: resetImageStudio } = useImageStudioStore();
  const { showActionSheetWithOptions } = useActionSheet();

  const projects = useProjectsStore((s) => s.projects);
  const hasProjects = projects.length > 0;

  const handleNewReel = useCallback(() => {
    router.push('/(tabs)/(media)/reel' as any);
  }, []);

  const handleEditProject = useCallback((project: Project) => {
    router.push({
      pathname: '/(fullscreen)/subtitle-editor',
      params: { projectId: project.id, projectData: JSON.stringify(project) },
    });
  }, []);

  const handleShareProject = useCallback(async (project: Project) => {
    const videoUrl = getVideoUrl(project.id);
    await shareService.shareUrl(videoUrl, project.title, 'Schau dir dieses Reel an!');
  }, []);

  const handleNewImage = useCallback(() => {
    resetImageStudio();
    setKiType('pure-create');
    router.push(route('/(focused)/image-studio-create/ki-input'));
  }, [resetImageStudio, setKiType]);

  const handleCreate = useCallback(() => {
    showActionSheetWithOptions(
      {
        options: ['Neues Reel', 'KI-Bild erstellen', 'Abbrechen'],
        cancelButtonIndex: 2,
        icons: [
          <Ionicons name="videocam-outline" size={20} color={colors.primary[600]} />,
          <Ionicons name="sparkles-outline" size={20} color={colors.primary[600]} />,
          <Ionicons name="close-outline" size={20} color={colors.grey[400]} />,
        ],
      },
      (index) => {
        if (index === 0) handleNewReel();
        else if (index === 1) handleNewImage();
      }
    );
  }, [showActionSheetWithOptions, handleNewReel, handleNewImage]);

  const handleVariantSelect = useCallback(
    (variant: KiStyleVariant) => {
      resetImageStudio();
      setKiType('pure-create');
      setKiVariant(variant, true);
      router.push(route('/(focused)/image-studio-create/ki-input'));
    },
    [resetImageStudio, setKiType, setKiVariant]
  );

  const handleEditSelect = useCallback(
    (type: ImageStudioKiType) => {
      resetImageStudio();
      setKiType(type);
      if (kiTypeRequiresImage(type)) {
        router.push(route('/(focused)/image-studio-create/image'));
      } else {
        router.push(route('/(focused)/image-studio-create/ki-input'));
      }
    },
    [resetImageStudio, setKiType]
  );

  const handleTemplateSelect = useCallback(
    (templateType: ImageStudioTemplateType) => {
      resetImageStudio();
      setType(templateType);
      if (!typeHasTextGeneration(templateType)) {
        router.push(route('/(focused)/image-studio-create/image'));
      } else {
        router.push(route('/(focused)/image-studio-create/template-input'));
      }
    },
    [resetImageStudio, setType]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.pageTitle, { color: theme.text }]}>Medien</Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Quick Create */}
        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor: pressed ? colors.primary[700] : colors.primary[600],
            },
          ]}
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.createButtonText}>Neu erstellen</Text>
        </Pressable>

        {/* Reel Projects — only if exist */}
        {hasProjects && (
          <ProjectList
            onSelectProject={handleEditProject}
            onEditProject={handleEditProject}
            onShareProject={handleShareProject}
            onNewReel={handleNewReel}
          />
        )}

        {/* Image Studio Type Selector */}
        <TypeSelector
          onSelectVariant={handleVariantSelect}
          onSelectEdit={handleEditSelect}
          onSelectTemplate={handleTemplateSelect}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
  },
  createButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
