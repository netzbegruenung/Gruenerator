import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';

import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import { Button } from '../common/Button';

interface VideoUploaderProps {
  onVideoSelected: (uri: string) => void;
}

const MAX_FILE_SIZE_MB = 500;
const MAX_DURATION_SECONDS = 600; // 10 minutes

export function VideoUploader({ onVideoSelected }: VideoUploaderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const [selectedVideo, setSelectedVideo] = useState<{
    uri: string;
    duration?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickVideo = useCallback(async () => {
    setError(null);

    // `legacy: true` skips the Android Photo Picker: on devices that record
    // HEVC/HDR (e.g. Samsung), the Photo Picker transcodes long videos to
    // AVC/SDR before handing them over ("Ausgewählte Medien werden
    // vorbereitet…" for minutes). The legacy document-style picker returns
    // the original file untouched — the subtitler backend (ffmpeg) handles
    // HEVC fine. Neither picker needs a runtime permission.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: MAX_DURATION_SECONDS,
      legacy: true,
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

  return (
    <View style={styles.container}>
      {!selectedVideo ? (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="videocam" size={64} color={theme.textGreen} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Automatische Reel-Erstellung</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Wähle ein Video aus oder nimm eines auf. Das Video wird automatisch optimiert und mit
            Untertiteln versehen.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[
                styles.optionButton,
                {
                  backgroundColor: isDark ? colors.primary[950] : colors.primary[50],
                  borderColor: isDark ? colors.primary[800] : colors.primary[200],
                },
              ]}
              onPress={pickVideo}
            >
              <Ionicons name="images-outline" size={32} color={theme.textGreen} />
              <Text style={[styles.optionText, { color: theme.textGreen }]}>Aus Galerie</Text>
            </Pressable>

            <Pressable
              style={[
                styles.optionButton,
                {
                  backgroundColor: isDark ? colors.primary[950] : colors.primary[50],
                  borderColor: isDark ? colors.primary[800] : colors.primary[200],
                },
              ]}
              onPress={recordVideo}
            >
              <Ionicons name="camera-outline" size={32} color={theme.textGreen} />
              <Text style={[styles.optionText, { color: theme.textGreen }]}>Aufnehmen</Text>
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Max. {MAX_FILE_SIZE_MB}MB, bis zu 10 Minuten
          </Text>
        </>
      ) : (
        <>
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedVideo.uri }} style={styles.preview} contentFit="cover" />
            <Pressable style={styles.clearButton} onPress={clearSelection}>
              <Ionicons name="close-circle" size={28} color={colors.white} />
            </Pressable>
            {selectedVideo.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(selectedVideo.duration)}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.readyText, { color: theme.textSecondary }]}>
            Video bereit zur Verarbeitung
          </Text>

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
  errorContainer: ViewStyle;
  errorText: TextStyle;
}>({
  container: {
    flex: 1,
    padding: spacing.large,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.large,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
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
    paddingVertical: spacing.large,
    paddingHorizontal: spacing.xlarge,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    gap: spacing.small,
    borderWidth: 1,
  },
  optionText: {
    ...typography.button,
  },
  hint: {
    ...typography.caption,
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
    marginBottom: spacing.large,
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
