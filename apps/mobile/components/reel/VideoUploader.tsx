import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button } from '../common/Button';

interface VideoUploaderProps {
  onVideoSelected: (uri: string) => void;
  uploadProgress: number;
  isUploading: boolean;
  onBack?: () => void;
}

const MAX_FILE_SIZE_MB = 500;
const MAX_DURATION_SECONDS = 600; // 10 minutes

export function VideoUploader({ onVideoSelected, uploadProgress, isUploading, onBack }: VideoUploaderProps) {
  const [selectedVideo, setSelectedVideo] = useState<{
    uri: string;
    duration?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickVideo = useCallback(async () => {
    setError(null);

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setError('Zugriff auf die Galerie wurde verweigert');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: MAX_DURATION_SECONDS,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`Video ist zu groß. Maximal ${MAX_FILE_SIZE_MB}MB erlaubt.`);
        return;
      }

      setSelectedVideo({
        uri: asset.uri,
        duration: asset.duration ? asset.duration / 1000 : undefined,
        width: asset.width,
        height: asset.height,
      });
    }
  }, []);

  const recordVideo = useCallback(async () => {
    setError(null);

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      setError('Kamerazugriff wurde verweigert');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: MAX_DURATION_SECONDS,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedVideo({
        uri: asset.uri,
        duration: asset.duration ? asset.duration / 1000 : undefined,
        width: asset.width,
        height: asset.height,
      });
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedVideo(null);
    setError(null);
  }, []);

  const handleStartProcessing = useCallback(() => {
    if (selectedVideo) {
      onVideoSelected(selectedVideo.uri);
    }
  }, [selectedVideo, onVideoSelected]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isUploading) {
    return (
      <View style={styles.container}>
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.uploadingText}>Video wird hochgeladen...</Text>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {onBack && (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={colors.primary[600]} />
          <Text style={styles.backButtonText}>Zurück</Text>
        </Pressable>
      )}

      {!selectedVideo ? (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="videocam" size={64} color={colors.primary[600]} />
          </View>

          <Text style={styles.title}>Automatische Reel-Erstellung</Text>
          <Text style={styles.subtitle}>
            Wähle ein Video aus oder nimm eines auf. Das Video wird automatisch optimiert und mit
            Untertiteln versehen.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable style={styles.optionButton} onPress={pickVideo}>
              <Ionicons name="images-outline" size={32} color={colors.primary[600]} />
              <Text style={styles.optionText}>Aus Galerie</Text>
            </Pressable>

            <Pressable style={styles.optionButton} onPress={recordVideo}>
              <Ionicons name="camera-outline" size={32} color={colors.primary[600]} />
              <Text style={styles.optionText}>Aufnehmen</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>Max. {MAX_FILE_SIZE_MB}MB, bis zu 10 Minuten</Text>
        </>
      ) : (
        <>
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedVideo.uri }} style={styles.preview} resizeMode="cover" />
            <Pressable style={styles.clearButton} onPress={clearSelection}>
              <Ionicons name="close-circle" size={28} color={colors.white} />
            </Pressable>
            {selectedVideo.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(selectedVideo.duration)}</Text>
              </View>
            )}
          </View>

          <Text style={styles.readyText}>Video bereit zur Verarbeitung</Text>

          <Button onPress={handleStartProcessing}>Reel erstellen</Button>
        </>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color={colors.error[500]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  backButton: ViewStyle;
  backButtonText: TextStyle;
  iconContainer: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  buttonContainer: ViewStyle;
  optionButton: ViewStyle;
  optionText: TextStyle;
  hint: TextStyle;
  previewContainer: ViewStyle;
  preview: ImageStyle;
  clearButton: ViewStyle;
  durationBadge: ViewStyle;
  durationText: TextStyle;
  readyText: TextStyle;
  uploadingContainer: ViewStyle;
  uploadingText: TextStyle;
  progressContainer: ViewStyle;
  progressBar: ViewStyle;
  progressText: TextStyle;
  errorContainer: ViewStyle;
  errorText: TextStyle;
}>({
  container: {
    flex: 1,
    padding: spacing.large,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: spacing.medium,
    left: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.small,
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary[600],
    fontWeight: '500',
  },
  iconContainer: {
    marginBottom: spacing.large,
  },
  title: {
    ...typography.h2,
    color: colors.grey[800],
    textAlign: 'center',
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
    color: colors.grey[600],
    textAlign: 'center',
    marginBottom: spacing.xlarge,
    paddingHorizontal: spacing.medium,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.medium,
    marginBottom: spacing.large,
  },
  optionButton: {
    backgroundColor: colors.primary[50],
    paddingVertical: spacing.large,
    paddingHorizontal: spacing.xlarge,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    gap: spacing.small,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  optionText: {
    ...typography.button,
    color: colors.primary[600],
  },
  hint: {
    ...typography.caption,
    color: colors.grey[500],
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 400,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    marginBottom: spacing.large,
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  clearButton: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: borderRadius.full,
    padding: spacing.xxsmall,
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.small,
    right: spacing.small,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.small,
  },
  durationText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  readyText: {
    ...typography.body,
    color: colors.grey[600],
    marginBottom: spacing.large,
  },
  uploadingContainer: {
    alignItems: 'center',
    gap: spacing.medium,
  },
  uploadingText: {
    ...typography.body,
    color: colors.grey[700],
  },
  progressContainer: {
    width: 200,
    height: 6,
    backgroundColor: colors.grey[200],
    borderRadius: borderRadius.small,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary[600],
  },
  progressText: {
    ...typography.caption,
    color: colors.grey[600],
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.medium,
    padding: spacing.small,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    borderRadius: borderRadius.medium,
  },
  errorText: {
    ...typography.caption,
    color: colors.error[500],
  },
});
