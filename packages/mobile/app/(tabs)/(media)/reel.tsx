import { View, StyleSheet, useColorScheme, ScrollView, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors, spacing } from '../../../theme';
import { useReelProcessing } from '../../../hooks/useReelProcessing';
import { VideoUploader, ProcessingProgress, VideoResult } from '../../../components/reel';

export default function ReelScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    status,
    uploadProgress,
    processingStage,
    stageName,
    stageProgress,
    overallProgress,
    videoUri,
    savedToGallery,
    error,
    startProcessing,
    cancelProcessing,
    reset,
    saveToGallery,
  } = useReelProcessing();

  const renderContent = () => {
    switch (status) {
      case 'idle':
        return (
          <VideoUploader
            onVideoSelected={startProcessing}
            uploadProgress={0}
            isUploading={false}
          />
        );

      case 'uploading':
        return (
          <VideoUploader
            onVideoSelected={startProcessing}
            uploadProgress={uploadProgress}
            isUploading={true}
          />
        );

      case 'processing':
        return (
          <ProcessingProgress
            currentStage={processingStage}
            stageName={stageName}
            stageProgress={stageProgress}
            overallProgress={overallProgress}
            onCancel={cancelProcessing}
          />
        );

      case 'downloading':
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              Video wird heruntergeladen...
            </Text>
          </View>
        );

      case 'complete':
        if (videoUri) {
          return (
            <VideoResult
              videoUri={videoUri}
              savedToGallery={savedToGallery}
              onNewVideo={reset}
              onSaveToGallery={!savedToGallery ? () => saveToGallery(videoUri) : undefined}
            />
          );
        }
        return null;

      case 'error':
        return (
          <VideoUploader
            onVideoSelected={startProcessing}
            uploadProgress={0}
            isUploading={false}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
