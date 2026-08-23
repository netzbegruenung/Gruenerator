/**
 * PushedContentScreen
 * Read-only viewer for a shared image or video, opened from the recent-activity
 * list (`useRecentActivity`). Allows saving to gallery or sharing via the native
 * share sheet.
 *
 * The route name is a leftover from push-to-phone, which used to be one way in;
 * the screen itself never depended on notifications.
 */

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Alert,
} from 'react-native';

import { Button } from '../../components/common/Button';
import { alertSavedToGallery } from '../../services/gallery';
import { shareFile } from '../../services/share';
import { getCachedShareFile } from '../../services/sharedMediaCache';
import { secureStorage } from '../../services/storage';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../theme';
import { getErrorMessage } from '../../utils/errors';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

type LoadingState = 'loading' | 'ready' | 'error' | 'expired';

export default function PushedContentScreen() {
  const {
    shareToken,
    mediaType,
    title: titleParam,
  } = useLocalSearchParams<{
    shareToken: string;
    mediaType: string;
    title?: string;
  }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [state, setState] = useState<LoadingState>('loading');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [title, setTitle] = useState<string>(titleParam ?? '');
  const [savedToGallery, setSavedToGallery] = useState(false);

  const isVideo = mediaType === 'video';

  const player = useVideoPlayer(isVideo && localUri ? localUri : '', (p) => {
    p.loop = true;
  });

  // Load content on mount — cache-first, download only on a miss.
  useEffect(() => {
    async function loadContent() {
      if (!shareToken) {
        setState('error');
        return;
      }

      const target = getCachedShareFile(shareToken, isVideo ? 'mp4' : 'png');

      // Cache-first: a share's content is immutable for its token, so once the file
      // is on disk (downloaded here, or written at creation time for in-app content)
      // we reuse it instead of re-fetching on every open.
      if (target.exists) {
        setLocalUri(target.uri);
        setState('ready');
        return;
      }

      try {
        const token = await secureStorage.getToken();

        // Fetch share metadata (title + availability/expiry check)
        const infoRes = await fetch(`${API_BASE_URL}/share/${shareToken}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!infoRes.ok) {
          setState(infoRes.status === 404 ? 'expired' : 'error');
          return;
        }

        const info = (await infoRes.json()) as { share?: { title?: string }; title?: string };
        const resolvedTitle = info.share?.title ?? info.title;
        if (resolvedTitle) {
          setTitle(resolvedTitle);
        }

        const downloadedFile = await File.downloadFileAsync(
          `${API_BASE_URL}/share/${shareToken}/download`,
          target,
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
        console.error('[PushedContent] Load failed:', error);
        setState('error');
      }
    }

    void loadContent();
  }, [shareToken, isVideo]);

  const handleSaveToGallery = useCallback(async () => {
    if (!localUri) return;
    // Write-only: saving only, never reading the library.
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert(
        'Galerie-Berechtigung',
        `Bitte erlaube den Zugriff auf die Galerie, um ${isVideo ? 'das Video' : 'das Bild'} zu speichern.`
      );
      return;
    }

    try {
      const asset = await MediaLibrary.Asset.create(localUri);
      setSavedToGallery(true);
      alertSavedToGallery(
        asset.id,
        `${isVideo ? 'Das Video' : 'Das Bild'} wurde in der Galerie gespeichert.`
      );
    } catch (error: unknown) {
      // A throw here used to leave the button looking untouched — no badge, no
      // message, nothing to tell the user the save never happened.
      console.error('[PushedContent] Save to gallery failed:', getErrorMessage(error));
      Alert.alert('Fehler', 'Der Inhalt konnte nicht gespeichert werden.');
    }
  }, [localUri, isVideo]);

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
        <Pressable
          onPress={handleClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
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
          <Image source={{ uri: localUri }} style={styles.preview} contentFit="contain" />
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
    fontFamily: BODY_FONT,
    fontSize: 16,
    marginTop: spacing.small,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
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
