/**
 * VideoPreviewWithSubtitle Component
 * Video player with subtitle overlay
 */

import { useMemo, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../theme';
import { SubtitleOverlay } from './SubtitleOverlay';
import { secureStorage } from '../../services/storage';
import type { SubtitleSegment, SubtitleStylePreference, SubtitleHeightPreference } from '@gruenerator/shared/subtitle-editor';

interface VideoPreviewWithSubtitleProps {
  videoUri: string;
  isRemoteVideo?: boolean;
  segments: SubtitleSegment[];
  currentTime: number;
  stylePreference: SubtitleStylePreference;
  heightPreference: SubtitleHeightPreference;
  onTogglePlayback: () => void;
  isPlaying: boolean;
}

export function VideoPreviewWithSubtitle({
  videoUri,
  isRemoteVideo = false,
  segments,
  currentTime,
  stylePreference,
  heightPreference,
  onTogglePlayback,
  isPlaying,
}: VideoPreviewWithSubtitleProps) {
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

  const isLoading = isRemoteVideo && !authToken;

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <>
          <VideoPlayer
            source={videoSource}
            onTogglePlayback={onTogglePlayback}
            isPlaying={isPlaying}
          />
          <SubtitleOverlay
            segments={segments}
            currentTime={currentTime}
            stylePreference={stylePreference}
            heightPreference={heightPreference}
          />
        </>
      )}
    </View>
  );
}

interface VideoPlayerProps {
  source: string | { uri: string; headers: Record<string, string> } | null;
  onTogglePlayback: () => void;
  isPlaying: boolean;
}

function VideoPlayer({ source, onTogglePlayback, isPlaying }: VideoPlayerProps) {
  const player = useVideoPlayer(source ?? '', (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (!player) return;

    if (isPlaying && !player.playing) {
      player.play();
    } else if (!isPlaying && player.playing) {
      player.pause();
    }
  }, [isPlaying, player]);

  if (!source) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  return (
    <>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      <Pressable style={styles.playOverlay} onPress={onTogglePlayback}>
        {!isPlaying && (
          <View style={styles.playButton}>
            <Ionicons name="play" size={28} color={colors.white} />
          </View>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 280,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    backgroundColor: colors.black,
    position: 'relative',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
});
