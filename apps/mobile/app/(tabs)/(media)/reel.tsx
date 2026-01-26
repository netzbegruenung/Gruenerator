import { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Text,
  BackHandler,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors, spacing } from '../../../theme';
import { useReelProcessing } from '../../../hooks/useReelProcessing';
import {
  VideoUploader,
  ProcessingProgress,
  VideoResult,
  ProjectList,
  ModeSelector,
} from '../../../components/reel';
import { type Project, getVideoUrl, saveProject, useProjectsStore } from '@gruenerator/shared';
import { shareService } from '../../../services/share';
import type { ReelMode } from '../../../components/reel/ModeSelector';

type ScreenMode = 'projects' | 'creating' | 'mode-select' | 'processing' | 'transcribing';

export default function ReelScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [screenMode, setScreenMode] = useState<ScreenMode>('projects');
  const [pendingVideoUri, setPendingVideoUri] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);

  const {
    status,
    uploadProgress,
    processingStage,
    stageName,
    stageProgress,
    overallProgress,
    uploadId,
    videoUri,
    savedToGallery,
    error,
    transcribedSubtitles,
    startProcessing,
    startManualProcessing,
    cancelProcessing,
    reset,
    saveToGallery,
  } = useReelProcessing();

  const handleNewReel = useCallback(() => {
    reset();
    setPendingVideoUri(null);
    setScreenMode('creating');
  }, [reset]);

  const handleBackToProjects = useCallback(() => {
    reset();
    setPendingVideoUri(null);
    setScreenMode('projects');
  }, [reset]);

  const handleEditProject = useCallback((project: Project) => {
    router.push({
      pathname: '/(fullscreen)/subtitle-editor',
      params: {
        projectId: project.id,
        projectData: JSON.stringify(project),
      },
    });
  }, []);

  const handleShareProject = useCallback(async (project: Project) => {
    const videoUrl = getVideoUrl(project.id);
    await shareService.shareUrl(videoUrl, project.title, 'Schau dir dieses Reel an!');
  }, []);

  const handleVideoSelected = useCallback((fileUri: string) => {
    setPendingVideoUri(fileUri);
    setScreenMode('mode-select');
  }, []);

  const handleModeSelect = useCallback(
    (mode: ReelMode) => {
      if (!pendingVideoUri) return;

      if (mode === 'auto') {
        setScreenMode('processing');
        startProcessing(pendingVideoUri);
      } else if (mode === 'subtitle') {
        setScreenMode('transcribing');
        startManualProcessing(pendingVideoUri);
      }
    },
    [pendingVideoUri, startProcessing, startManualProcessing]
  );

  const handleBackFromModeSelect = useCallback(() => {
    setPendingVideoUri(null);
    setScreenMode('creating');
  }, []);

  useEffect(() => {
    if (
      screenMode === 'transcribing' &&
      status === 'complete' &&
      transcribedSubtitles &&
      uploadId &&
      !isSavingProject
    ) {
      const saveAndNavigate = async () => {
        setIsSavingProject(true);
        try {
          const { project: savedProject } = await saveProject({
            uploadId,
            subtitles: transcribedSubtitles,
            stylePreference: 'shadow',
            heightPreference: 'tief',
            modePreference: 'manual',
            title: 'Neues Reel',
          });

          useProjectsStore.getState().fetchProjects();

          setScreenMode('projects');
          router.push({
            pathname: '/(fullscreen)/subtitle-editor',
            params: {
              projectId: savedProject.id,
              projectData: JSON.stringify(savedProject),
            },
          });
        } catch (error) {
          console.error('[ReelScreen] Failed to auto-save project:', error);
          const tempProject: Project = {
            id: `temp-${uploadId}`,
            user_id: '',
            upload_id: uploadId,
            title: 'Neues Reel',
            thumbnail_path: null,
            video_path: null,
            video_metadata: null,
            video_size: 0,
            video_filename: null,
            subtitles: transcribedSubtitles,
            style_preference: 'shadow',
            height_preference: 'tief',
            mode_preference: 'manual',
            export_count: 0,
            last_edited_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          setScreenMode('projects');
          router.push({
            pathname: '/(fullscreen)/subtitle-editor',
            params: {
              projectId: tempProject.id,
              projectData: JSON.stringify(tempProject),
            },
          });
        } finally {
          setIsSavingProject(false);
        }
      };

      saveAndNavigate();
    }
  }, [screenMode, status, transcribedSubtitles, uploadId, isSavingProject]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (screenMode === 'mode-select') {
          handleBackFromModeSelect();
          return true;
        }
        if (screenMode !== 'projects') {
          handleBackToProjects();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [screenMode, handleBackToProjects, handleBackFromModeSelect])
  );

  const renderContent = () => {
    // Show project list
    if (screenMode === 'projects') {
      return (
        <ProjectList
          onSelectProject={handleEditProject}
          onEditProject={handleEditProject}
          onShareProject={handleShareProject}
          onNewReel={handleNewReel}
        />
      );
    }

    // Show video uploader for new reel
    if (screenMode === 'creating') {
      return (
        <VideoUploader
          onVideoSelected={handleVideoSelected}
          uploadProgress={0}
          isUploading={false}
          onBack={handleBackToProjects}
        />
      );
    }

    // Show mode selector after video is selected
    if (screenMode === 'mode-select') {
      return <ModeSelector onSelect={handleModeSelect} onBack={handleBackFromModeSelect} />;
    }

    // Show transcribing state (manual mode)
    if (screenMode === 'transcribing') {
      if (status === 'uploading') {
        return (
          <VideoUploader
            onVideoSelected={handleVideoSelected}
            uploadProgress={uploadProgress}
            isUploading={true}
          />
        );
      }

      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {isSavingProject
              ? 'Projekt wird gespeichert...'
              : stageName || 'Untertitel werden grüneriert...'}
          </Text>
          <Text style={[styles.loadingSubtext, { color: theme.textSecondary }]}>
            {isSavingProject ? 'Fast fertig!' : 'Dies kann einige Minuten dauern'}
          </Text>
        </View>
      );
    }

    // Show processing or processing-related states (auto mode)
    if (screenMode === 'processing' || status === 'processing' || status === 'uploading') {
      if (status === 'uploading') {
        return (
          <VideoUploader
            onVideoSelected={handleVideoSelected}
            uploadProgress={uploadProgress}
            isUploading={true}
          />
        );
      }

      if (status === 'processing') {
        return (
          <ProcessingProgress
            currentStage={processingStage}
            stageName={stageName}
            stageProgress={stageProgress}
            overallProgress={overallProgress}
            onCancel={() => {
              cancelProcessing();
              handleBackToProjects();
            }}
          />
        );
      }

      if (status === 'downloading') {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Video wird heruntergeladen...
            </Text>
          </View>
        );
      }

      if (status === 'complete' && videoUri) {
        return (
          <VideoResult
            videoUri={videoUri}
            savedToGallery={savedToGallery}
            uploadId={uploadId || undefined}
            onNewVideo={handleBackToProjects}
            onSaveToGallery={!savedToGallery ? () => saveToGallery(videoUri) : undefined}
          />
        );
      }
    }

    // Fallback to project list
    return (
      <ProjectList
        onSelectProject={handleEditProject}
        onEditProject={handleEditProject}
        onShareProject={handleShareProject}
        onNewReel={handleNewReel}
      />
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['bottom']}
    >
      <View style={styles.content}>
        {renderContent()}

        {error && screenMode !== 'projects' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  content: ViewStyle;
  loadingContainer: ViewStyle;
  loadingText: TextStyle;
  loadingSubtext: TextStyle;
  errorContainer: ViewStyle;
  errorText: TextStyle;
}>({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.medium,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: -spacing.xsmall,
  },
  errorContainer: {
    marginHorizontal: spacing.large,
    marginBottom: spacing.large,
    padding: spacing.medium,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    color: colors.error[500],
    textAlign: 'center',
  },
});
