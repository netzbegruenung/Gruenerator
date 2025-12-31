import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, useColorScheme, ActivityIndicator, Text, BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors, spacing } from '../../../theme';
import { useReelProcessing } from '../../../hooks/useReelProcessing';
import { VideoUploader, ProcessingProgress, VideoResult, ProjectList, ModeSelector } from '../../../components/reel';
import { SubtitleEditorScreen } from '../../../components/subtitle-editor';
import { type Project, getVideoUrl } from '@gruenerator/shared';
import type { ReelMode } from '../../../components/reel/ModeSelector';

type ScreenMode = 'projects' | 'creating' | 'mode-select' | 'processing' | 'transcribing' | 'viewing' | 'editing';

export default function ReelScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [screenMode, setScreenMode] = useState<ScreenMode>('projects');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [pendingVideoUri, setPendingVideoUri] = useState<string | null>(null);

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
    setSelectedProject(null);
    setPendingVideoUri(null);
    setScreenMode('creating');
  }, [reset]);

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setScreenMode('viewing');
  }, []);

  const handleBackToProjects = useCallback(() => {
    reset();
    setSelectedProject(null);
    setPendingVideoUri(null);
    setScreenMode('projects');
  }, [reset]);

  const handleEditProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setScreenMode('editing');
  }, []);

  const handleVideoSelected = useCallback((fileUri: string) => {
    setPendingVideoUri(fileUri);
    setScreenMode('mode-select');
  }, []);

  const handleModeSelect = useCallback((mode: ReelMode) => {
    if (!pendingVideoUri) return;

    if (mode === 'auto') {
      setScreenMode('processing');
      startProcessing(pendingVideoUri);
    } else if (mode === 'subtitle') {
      setScreenMode('transcribing');
      startManualProcessing(pendingVideoUri);
    }
  }, [pendingVideoUri, startProcessing, startManualProcessing]);

  const handleBackFromModeSelect = useCallback(() => {
    setPendingVideoUri(null);
    setScreenMode('creating');
  }, []);

  useEffect(() => {
    if (screenMode === 'transcribing' && status === 'complete' && transcribedSubtitles && uploadId) {
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
      setSelectedProject(tempProject);
      setScreenMode('editing');
    }
  }, [screenMode, status, transcribedSubtitles, uploadId]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (screenMode === 'editing') {
          if (selectedProject?.id.startsWith('temp-')) {
            handleBackToProjects();
          } else {
            setScreenMode('viewing');
          }
          return true;
        }
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
    }, [screenMode, selectedProject, handleBackToProjects, handleBackFromModeSelect])
  );

  const renderContent = () => {
    // Show subtitle editor
    if (screenMode === 'editing' && selectedProject) {
      const isTempProject = selectedProject.id.startsWith('temp-');
      return (
        <SubtitleEditorScreen
          project={selectedProject}
          onBack={() => isTempProject ? handleBackToProjects() : setScreenMode('viewing')}
          onSaved={() => isTempProject ? handleBackToProjects() : setScreenMode('viewing')}
        />
      );
    }

    // Show project list
    if (screenMode === 'projects') {
      return (
        <ProjectList
          onSelectProject={handleSelectProject}
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
      return (
        <ModeSelector
          onSelect={handleModeSelect}
          onBack={handleBackFromModeSelect}
        />
      );
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
            {stageName || 'Untertitel werden grüneriert...'}
          </Text>
          <Text style={[styles.loadingSubtext, { color: theme.textSecondary }]}>
            Dies kann einige Minuten dauern
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

    // Show selected project video
    if (screenMode === 'viewing' && selectedProject) {
      const projectVideoUrl = getVideoUrl(selectedProject.id);
      return (
        <VideoResult
          videoUri={projectVideoUrl}
          savedToGallery={true}
          uploadId={selectedProject.upload_id}
          projectId={selectedProject.id}
          projectTitle={selectedProject.title}
          onNewVideo={handleBackToProjects}
          isRemoteVideo={true}
          onEdit={() => handleEditProject(selectedProject)}
        />
      );
    }

    // Fallback to project list
    return (
      <ProjectList
        onSelectProject={handleSelectProject}
        onNewReel={handleNewReel}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
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

const styles = StyleSheet.create({
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
    color: colors.error,
    textAlign: 'center',
  },
});
