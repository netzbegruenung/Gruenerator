import { type Project, getVideoUrl, saveProject, useProjectsStore } from '@gruenerator/shared';
import { parseSubtitlesText } from '@gruenerator/shared/subtitle-editor';
import { useFocusEffect, router } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  Text,
  BackHandler,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseLoader } from '../../../components/common';
import { VideoUploader, ProjectList } from '../../../components/reel';
import { useReelProcessing } from '../../../hooks/useReelProcessing';
import { shareService } from '../../../services/share';
import { lightTheme, darkTheme, colors, spacing } from '../../../theme';

type ScreenMode = 'projects' | 'creating' | 'transcribing';

export default function ReelScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [screenMode, setScreenMode] = useState<ScreenMode>('projects');
  const [isSavingProject, setIsSavingProject] = useState(false);

  const {
    status,
    uploadProgress,
    stageName,
    uploadId,
    error,
    transcribedSubtitles,
    startManualProcessing,
    cancelProcessing,
    reset,
  } = useReelProcessing();

  const handleNewReel = useCallback(() => {
    reset();
    setScreenMode('creating');
  }, [reset]);

  // Returning to the list also stops any in-flight upload/transcription
  // (aborts the native upload + clears the server temp files), so backing
  // out is a real cancel rather than just hiding the progress screen.
  const handleBackToProjects = useCallback(() => {
    cancelProcessing();
    setScreenMode('projects');
  }, [cancelProcessing]);

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

  // Create-first: picking a video immediately uploads + transcribes, then the
  // effect below auto-saves the project and opens the editor. The user always
  // lands on a persistent, editable reel — no upfront mode choice, no dead-end.
  const handleVideoSelected = useCallback(
    (fileUri: string) => {
      setScreenMode('transcribing');
      void startManualProcessing(fileUri);
    },
    [startManualProcessing]
  );

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
          // `transcribedSubtitles` is the raw SRT blob from the
          // transcription flow. The POST /subtitler/projects contract now
          // requires a `SubtitleSegment[]` on the wire (canonicalized
          // 2026-04-13 — see packages/contracts/src/schemas/subtitler.ts),
          // so parse the SRT into segments and strip the client-only `id`
          // field at the save boundary before sending.
          const parsedSegments = parseSubtitlesText(transcribedSubtitles);
          const { project: savedProject } = await saveProject({
            uploadId,
            subtitles: parsedSegments.map((s) => ({
              text: s.text,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
            stylePreference: 'shadow',
            heightPreference: 'tief',
            modePreference: 'manual',
            title: 'Neues Reel',
          });

          void useProjectsStore.getState().fetchProjects();

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

      void saveAndNavigate();
    }
  }, [screenMode, status, transcribedSubtitles, uploadId, isSavingProject]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
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

    // Create-first: upload the video, transcribe, then auto-save + open editor.
    if (screenMode === 'transcribing') {
      if (status === 'uploading') {
        return (
          <VideoUploader
            onVideoSelected={handleVideoSelected}
            uploadProgress={uploadProgress}
            isUploading={true}
            onBack={handleBackToProjects}
          />
        );
      }

      return (
        <PulseLoader
          title={
            isSavingProject
              ? 'Projekt wird gespeichert...'
              : stageName || 'Untertitel werden grüneriert...'
          }
          subtitle={isSavingProject ? 'Fast fertig!' : 'Dies kann einige Minuten dauern'}
          icon="text-outline"
          onCancel={isSavingProject ? undefined : handleBackToProjects}
        />
      );
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
