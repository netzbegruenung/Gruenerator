import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { useEvent } from 'expo';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Platform,
  Alert,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import { getGlobalApiClient } from '../../services/api';
import { copyToClipboard } from '../../services/share';
import { useSubtitleEditorStore } from '../../stores/subtitleEditorStore';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import { Button } from '../common/Button';

import type { ExportStatus } from '../../hooks/useSubtitleExport';

interface ExportScreenProps {
  status: ExportStatus;
  progress: number;
  videoUri: string | null;
  error: string | null;
  onBackToEditor: () => void;
  onGoHome: () => void;
}

function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  loading = false,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.iconButtonWrapper,
        pressed && styles.iconButtonPressed,
        (disabled || loading) && styles.iconButtonDisabled,
      ]}
    >
      <View style={[styles.iconButtonCircle, active && styles.iconButtonCircleActive]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Ionicons name={icon} size={24} color={colors.white} />
        )}
      </View>
      <Text style={[styles.iconButtonLabel, { color: theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ExportScreen({
  status,
  progress,
  videoUri,
  error,
  onBackToEditor,
  onGoHome,
}: ExportScreenProps) {
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [socialText, setSocialText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuth();

  const mdStyles = useMemo(
    () => ({
      body: { color: theme.text, fontSize: 14, lineHeight: 20 },
      paragraph: { marginTop: 0, marginBottom: 6 },
      strong: { fontWeight: '700' as const },
      bullet_list: { marginVertical: 4 },
      ordered_list: { marginVertical: 4 },
      list_item: { marginVertical: 2 },
    }),
    [theme.text]
  );
  const firstName = user?.display_name?.split(' ')[0] || '';

  const subtitlesTextRef = useRef(
    useSubtitleEditorStore
      .getState()
      .segments.map((s) => s.text)
      .join('\n')
  );

  const player = useVideoPlayer(videoUri ?? '', (p) => {
    p.loop = true;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const handleSaveToGallery = useCallback(async () => {
    if (!videoUri) return;
    const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
    if (permStatus !== 'granted') return;
    await MediaLibrary.saveToLibraryAsync(videoUri);
    setSavedToGallery(true);
  }, [videoUri]);

  const handleShare = useCallback(async () => {
    if (!videoUri) return;
    await Sharing.shareAsync(videoUri, {
      mimeType: 'video/mp4',
      dialogTitle: 'Video teilen',
      UTI: Platform.OS === 'ios' ? 'public.movie' : undefined,
    });
  }, [videoUri]);

  const handleGenerateSocialText = useCallback(async () => {
    if (isGenerating || socialText) return;
    setIsGenerating(true);

    try {
      const subtitlesText = subtitlesTextRef.current;

      if (!subtitlesText.trim()) {
        Alert.alert(
          'Keine Untertitel',
          'Es sind keine Untertitel vorhanden, um einen Text zu erstellen.'
        );
        setIsGenerating(false);
        return;
      }

      const apiClient = getGlobalApiClient();
      const response = await apiClient.post<{ content: string }>('/subtitler/generate-social', {
        subtitles: subtitlesText,
      });

      if (response.data?.content) {
        setSocialText(response.data.content);
      } else {
        Alert.alert('Fehler', 'Der Text konnte nicht erstellt werden. Bitte versuche es erneut.');
      }
    } catch (err) {
      console.error('[ExportScreen] Failed to generate social text:', err);
      Alert.alert('Fehler', 'Der Text konnte nicht erstellt werden. Bitte versuche es erneut.');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, socialText]);

  const handleCopySocialText = useCallback(async () => {
    if (!socialText) return;
    const success = await copyToClipboard(socialText);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [socialText]);

  const isInProgress = status === 'saving' || status === 'exporting' || status === 'downloading';

  if (isInProgress) {
    const statusText =
      status === 'saving'
        ? 'Wird gespeichert...'
        : status === 'downloading'
          ? 'Wird heruntergeladen...'
          : 'Video wird exportiert...';

    return (
      <View style={[styles.progressContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.progressTitle, { color: theme.text }]}>{statusText}</Text>
        <View style={styles.progressBarWrapper}>
          <View style={[styles.progressBarTrack, { backgroundColor: theme.cardBorder }]}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progress)}%` }]} />
          </View>
          <Text style={[styles.progressPercent, { color: theme.textSecondary }]}>
            {Math.round(progress)}%
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.progressContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.error[500]} />
        <Text style={[styles.progressTitle, { color: theme.text }]}>Export fehlgeschlagen</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Button onPress={onBackToEditor} variant="outline">
          Zurück zum Editor
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>
          {firstName ? `Super Reel, ${firstName}!` : 'Super Reel!'}
        </Text>
        {savedToGallery && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark" size={14} color={colors.primary[700]} />
            <Text style={styles.savedBadgeText}>In Galerie gespeichert</Text>
          </View>
        )}
      </View>

      <View style={styles.videoContainer}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />

        <Pressable style={styles.playOverlay} onPress={togglePlayback}>
          {!isPlaying && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={32} color={colors.white} />
            </View>
          )}
        </Pressable>

        <View style={styles.videoControls}>
          <Pressable style={styles.controlButton} onPress={togglePlayback}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {/* Icon button row */}
      <View style={styles.iconButtonRow}>
        <IconButton
          icon={savedToGallery ? 'checkmark-circle' : 'download-outline'}
          label="Speichern"
          onPress={handleSaveToGallery}
          disabled={savedToGallery}
          active={savedToGallery}
        />
        <IconButton icon="share-outline" label="Teilen" onPress={handleShare} />
        <IconButton
          icon="document-text-outline"
          label="Beitragstext"
          onPress={handleGenerateSocialText}
          loading={isGenerating}
          disabled={!!socialText}
          active={!!socialText}
        />
        <IconButton icon="home-outline" label="Startseite" onPress={onGoHome} />
      </View>

      {/* Generated social text card */}
      {socialText && (
        <View
          style={[
            styles.socialTextCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <View style={styles.socialTextHeader}>
            <Text style={[styles.socialTextTitle, { color: theme.text }]}>Dein Beitragstext</Text>
            <Pressable onPress={handleCopySocialText} style={styles.copyButton} hitSlop={8}>
              <Ionicons
                name={isCopied ? 'checkmark' : 'copy-outline'}
                size={20}
                color={isCopied ? colors.primary[600] : theme.textSecondary}
              />
            </Pressable>
          </View>
          <Markdown style={mdStyles}>{socialText}</Markdown>
          {isCopied && <Text style={styles.copiedHint}>Kopiert!</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const ICON_BUTTON_SIZE = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.large,
    paddingBottom: spacing.xlarge,
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    paddingHorizontal: spacing.xlarge,
  },
  progressTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressBarWrapper: {
    width: '100%',
    maxWidth: 280,
    gap: spacing.small,
    alignItems: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary[600],
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    color: colors.error[500],
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.large,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    backgroundColor: colors.primary[50],
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
  },
  savedBadgeText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '500',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 400,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    backgroundColor: colors.black,
    marginBottom: spacing.large,
    position: 'relative',
    alignSelf: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  videoControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: spacing.medium,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: spacing.large,
  },
  iconButtonWrapper: {
    alignItems: 'center',
    minWidth: ICON_BUTTON_SIZE + 16,
  },
  iconButtonCircle: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonCircleActive: {},
  iconButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconButtonLabel: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  socialTextCard: {
    borderWidth: 1,
    borderRadius: borderRadius.large,
    padding: spacing.medium,
    marginBottom: spacing.large,
  },
  socialTextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.small,
  },
  socialTextTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  copyButton: {
    padding: spacing.xxsmall,
  },
  copiedHint: {
    ...typography.caption,
    color: colors.primary[600],
    marginTop: spacing.xxsmall,
    textAlign: 'right',
  },
});
