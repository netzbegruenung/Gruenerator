import { useState, useCallback } from 'react';
import { View, StyleSheet, useColorScheme, ActivityIndicator, Text, BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors, spacing } from '../../../theme';
import { useReelProcessing } from '../../../hooks/useReelProcessing';
import { VideoUploader, ProcessingProgress, VideoResult, ProjectList } from '../../../components/reel';
import { SubtitleEditorScreen } from '../../../components/subtitle-editor';
import { type Project, getVideoUrl } from '@gruenerator/shared';

type ScreenMode = 'projects' | 'creating' | 'processing' | 'viewing' | 'editing';

export default function ReelScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [screenMode, setScreenMode] = useState<ScreenMode>('projects');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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
    startProcessing,
    cancelProcessing,
    reset,
    saveToGallery,
  } = useReelProcessing();

  const handleNewReel = useCallback(() => {
    reset();
    setSelectedProject(null);
    setScreenMode('creating');
  }, [reset]);

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setScreenMode('viewing');
  }, []);

  const handleBackToProjects = useCallback(() => {
    reset();
    setSelectedProject(null);
    setScreenMode('projects');
  }, [reset]);

  const handleEditProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setScreenMode('editing');
  }, []);

  const handleStartProcessing = useCallback((fileUri: string) => {
    setScreenMode('processing');
    startProcessing(fileUri);
  }, [startProcessing]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (screenMode === 'editing') {
          setScreenMode('viewing');
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
    }, [screenMode, handleBackToProjects])
  );

  const renderContent = () => {
    // Show subtitle editor
    if (screenMode === 'editing' && selectedProject) {
      return (
        <SubtitleEditorScreen
          project={selectedProject}
          onBack={() => setScreenMode('viewing')}
          onSaved={() => setScreenMode('viewing')}
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
      if (status === 'idle' || status === 'error') {
        return (
          <VideoUploader
            onVideoSelected={handleStartProcessing}
            uploadProgress={0}
            isUploading={false}
            onBack={handleBackToProjects}
          />
        );
      }
      if (status === 'uploading') {
        return (
          <VideoUploader
            onVideoSelected={handleStartProcessing}
            uploadProgress={uploadProgress}
            isUploading={true}
            onBack={handleBackToProjects}
          />
        );
      }
    }

    // Show processing or processing-related states
    if (screenMode === 'processing' || status === 'processing' || status === 'uploading') {
      if (status === 'uploading') {
        return (
          <VideoUploader
            onVideoSelected={handleStartProcessing}
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
