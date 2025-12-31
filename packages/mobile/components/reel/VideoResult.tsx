import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button } from '../common/Button';
import { ShareModal } from '../share';
import { secureStorage } from '../../services/storage';

interface VideoResultProps {
  videoUri: string;
  savedToGallery: boolean;
  uploadId?: string;
  projectId?: string;
  projectTitle?: string;
  isRemoteVideo?: boolean;
  onNewVideo: () => void;
  onSaveToGallery?: () => void;
  onEdit?: () => void;
}

export function VideoResult({
  videoUri,
  savedToGallery,
  uploadId,
  projectId,
  projectTitle,
  isRemoteVideo = false,
  onNewVideo,
  onSaveToGallery,
  onEdit,
}: VideoResultProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    if (isRemoteVideo) {
      secureStorage.getToken().then(setAuthToken);
    }
  }, [isRemoteVideo]);

  const videoSource = useMemo(() => {
    if (isRemoteVideo) {
      return authToken
        ? { uri: videoUri, headers: { Authorization: `Bearer ${authToken}` } }
        : null;
    }
    return videoUri;
  }, [videoUri, isRemoteVideo, authToken]);

  const player = useVideoPlayer(videoSource ?? '', (player) => {
    player.loop = true;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.successHeader}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary[600]} />
        </View>
        <Text style={styles.title}>{projectTitle || 'Reel fertig!'}</Text>
        {savedToGallery && (
          <View style={styles.savedBadge}>
            <Ionicons name="folder" size={14} color={colors.primary[700]} />
            <Text style={styles.savedBadgeText}>In Galerie gespeichert</Text>
          </View>
        )}
      </View>

      <View style={styles.videoContainer}>
        {isRemoteVideo && !authToken ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
          </View>
        ) : (
          <>
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
          </>
        )}
      </View>

      <View style={styles.actions}>
        <Button onPress={() => setShowShareModal(true)} variant="primary">
          <Ionicons name="share-outline" size={18} color={colors.white} />
          {'  '}Teilen
        </Button>

        {onEdit && (
          <Button onPress={onEdit} variant="outline">
            <Ionicons name="create-outline" size={18} color={colors.grey[700]} />
            {'  '}Bearbeiten
          </Button>
        )}

        {!savedToGallery && onSaveToGallery && (
          <Button onPress={onSaveToGallery} variant="outline">
            In Galerie speichern
          </Button>
        )}

        <Button onPress={onNewVideo} variant="outline">
          {isRemoteVideo ? 'Zurück zu Projekten' : 'Neues Reel erstellen'}
        </Button>
      </View>

      {!isRemoteVideo && (
        <Text style={styles.hint}>
          Du kannst das Video direkt aus deiner Galerie in Instagram oder anderen Apps teilen.
        </Text>
      )}

      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        videoUri={videoUri}
        uploadId={uploadId}
        projectId={projectId}
        defaultTitle={projectTitle || 'Mein Reel'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.large,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: spacing.large,
  },
  successIcon: {
    marginBottom: spacing.small,
  },
  title: {
    ...typography.h2,
    color: colors.grey[800],
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
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
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
  actions: {
    gap: spacing.medium,
    marginBottom: spacing.large,
  },
  hint: {
    ...typography.caption,
    color: colors.grey[500],
    textAlign: 'center',
  },
});
