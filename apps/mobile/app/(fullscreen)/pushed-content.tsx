/**
 * PushedContentScreen
 * Displays content received via push-to-phone notification.
 * Allows saving to gallery or sharing via native share sheet.
 */

import { Ionicons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';

import { Button } from '../../components/common/Button';
import { shareFile } from '../../services/share';
import { secureStorage } from '../../services/storage';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

type LoadingState = 'loading' | 'ready' | 'error' | 'expired';

export default function PushedContentScreen() {
  const { shareToken, mediaType } = useLocalSearchParams<{
    shareToken: string;
    mediaType: string;
  }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [state, setState] = useState<LoadingState>('loading');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [savedToGallery, setSavedToGallery] = useState(false);

  const isVideo = mediaType === 'video';

  const player = useVideoPlayer(isVideo && localUri ? localUri : '', (p) => {
    p.loop = true;
  });

  // Download content on mount
  useEffect(() => {
    async function downloadContent() {
      if (!shareToken) {
        setState('error');
        return;
      }

      try {
        // Fetch share metadata
        const token = await secureStorage.getToken();
        const infoRes = await fetch(`${API_BASE_URL}/share/${shareToken}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!infoRes.ok) {
          setState(infoRes.status === 404 ? 'expired' : 'error');
          return;
        }

        const info = await infoRes.json();
        setTitle(info.share?.title || info.title || '');

        // Download the file using new expo-file-system API
        const ext = isVideo ? 'mp4' : 'png';
        const destination = new Directory(Paths.cache, 'pushed-content');
        destination.create({ idempotent: true });

        const downloadedFile = await File.downloadFileAsync(
          `${API_BASE_URL}/share/${shareToken}/download`,
          new File(destination, `pushed_${shareToken}.${ext}`),
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            idempotent: true,
          }
        );

        if (!downloadedFile.exists) {
          setState('error');
          return;
        }

        setLocalUri(downloadedFile.uri);
        setState('ready');
      } catch (error) {
        console.error('[PushedContent] Download failed:', error);
        setState('error');
      }
    }

    downloadContent();
  }, [shareToken, isVideo]);

  const handleSaveToGallery = useCallback(async () => {
    if (!localUri) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return;
    await MediaLibrary.saveToLibraryAsync(localUri);
    setSavedToGallery(true);
  }, [localUri]);

  const handleShare = useCallback(async () => {
    if (!localUri) return;
    const mimeType = isVideo ? 'video/mp4' : 'image/png';
    await shareFile(localUri, { mimeType });
  }, [localUri, isVideo]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Loading state
  if (state === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Wird heruntergeladen...</Text>
      </View>
    );
  }

  // Expired state
  if (state === 'expired') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.text }]}>Inhalt nicht mehr verfügbar</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Der geteilte Inhalt ist abgelaufen oder wurde gelöscht.
        </Text>
        <Button onPress={handleClose} variant="outline">
          Schließen
        </Button>
      </View>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.error[500]} />
        <Text style={[styles.title, { color: theme.text }]}>Fehler beim Laden</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Der Inhalt konnte nicht heruntergeladen werden.
        </Text>
        <Button onPress={handleClose} variant="outline">
          Schließen
        </Button>
      </View>
    );
  }

  // Ready state — show preview
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {title || (isVideo ? 'Video empfangen' : 'Bild empfangen')}
        </Text>
        <View style={styles.closeButton} />
      </View>

      {/* Preview */}
      <View style={styles.previewContainer}>
        {isVideo && localUri ? (
          <VideoView player={player} style={styles.preview} contentFit="contain" nativeControls />
        ) : localUri ? (
          <Image source={{ uri: localUri }} style={styles.preview} resizeMode="contain" />
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {savedToGallery ? (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary[700]} />
            <Text style={styles.savedBadgeText}>In Galerie gespeichert</Text>
          </View>
        ) : (
          <Button onPress={handleSaveToGallery} variant="primary">
            <Ionicons name="download-outline" size={18} color={colors.white} />
            {'  '}In Galerie speichern
          </Button>
        )}

        <Button onPress={handleShare} variant="outline">
          <Ionicons name="share-outline" size={18} color={colors.primary[600]} />
          {'  '}Teilen
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    paddingHorizontal: spacing.xlarge,
  },
  loadingText: {
    fontSize: 16,
    marginTop: spacing.small,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: spacing.small,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewContainer: {
    flex: 1,
    margin: spacing.medium,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  actions: {
    gap: spacing.medium,
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.xlarge,
    paddingTop: spacing.medium,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxsmall,
    backgroundColor: colors.primary[50],
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
  },
  savedBadgeText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '500',
  },
});
