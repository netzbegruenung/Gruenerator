/**
 * ReelReadyScreen
 *
 * End screen of the reel creation flow — shown after upload + transcription
 * auto-save, before the user commits to anything. Mirrors web's
 * VideoSuccessScreen intent: the reel is already created; editing is one of
 * several offered options rather than a forced next step. The subtitle
 * "burn-in" is a client-side overlay (SubtitleOverlay), so no server export
 * is needed to preview the result.
 */

import { type Project } from '@gruenerator/shared';
import { parseSubtitlesText } from '@gruenerator/shared/subtitle-editor';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { secureStorage } from '../../services/storage';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import { SubtitleOverlay } from '../subtitle-editor/SubtitleOverlay';

import type {
  SubtitleHeightPreference,
  SubtitleStylePreference,
} from '@gruenerator/shared/subtitle-editor';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

interface ReelReadyScreenProps {
  project: Project;
  onEdit: () => void;
  onShare: () => void;
  onNewReel: () => void;
}

function ActionButton({
  icon,
  label,
  onPress,
  textColor,
}: {
  icon: IoniconsIconName;
  label: string;
  onPress: () => void;
  textColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionWrapper, pressed && styles.actionPressed]}
    >
      <View style={styles.actionCircle}>
        <Ionicons name={icon} size={24} color={colors.white} />
      </View>
      <Text style={[styles.actionLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ReelReadyScreen({ project, onEdit, onShare, onNewReel }: ReelReadyScreenProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  const isTempProject = project.id.startsWith('temp-');

  useEffect(() => {
    if (!isTempProject) {
      void secureStorage.getToken().then(setAuthToken);
    }
  }, [isTempProject]);

  const segments = useMemo(() => parseSubtitlesText(project.subtitles), [project.subtitles]);
  const stylePreference = (project.style_preference || 'shadow') as SubtitleStylePreference;
  const heightPreference = (project.height_preference || 'tief') as SubtitleHeightPreference;

  const videoSource = useMemo(() => {
    if (isTempProject) {
      const uploadId = project.upload_id ?? project.id.replace('temp-', '');
      return `${API_BASE_URL}/subtitler/internal-video/${uploadId}`;
    }
    if (!authToken) return null;
    return {
      uri: `${API_BASE_URL}/subtitler/projects/${project.id}/video`,
      headers: { Authorization: `Bearer ${authToken}` },
    };
  }, [isTempProject, project, authToken]);

  const player = useVideoPlayer(videoSource ?? '', (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });

  const timeUpdate = useEvent(player, 'timeUpdate');
  const currentTime = timeUpdate?.currentTime ?? 0;

  const togglePlayback = () => {
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <View
          style={[
            styles.checkCircle,
            { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
          ]}
        >
          <Ionicons name="checkmark" size={28} color={theme.textGreen} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Dein Reel ist fertig!</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Untertitel wurden automatisch grüneriert – schau sie dir an und wähle, wie es weitergeht.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(120)} style={styles.videoContainer}>
        {videoSource != null && (
          <>
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
            />
            <SubtitleOverlay
              segments={segments}
              currentTime={currentTime}
              stylePreference={stylePreference}
              heightPreference={heightPreference}
            />
            <Pressable style={styles.playOverlay} onPress={togglePlayback}>
              {!isPlaying && (
                <View style={styles.playButton}>
                  <Ionicons name="play" size={28} color={colors.white} />
                </View>
              )}
            </Pressable>
          </>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(240)} style={styles.actionsRow}>
        <ActionButton
          icon="create-outline"
          label="Bearbeiten"
          onPress={onEdit}
          textColor={theme.text}
        />
        <ActionButton
          icon="share-outline"
          label="Teilen"
          onPress={onShare}
          textColor={theme.text}
        />
        <ActionButton
          icon="add-outline"
          label="Neues Reel"
          onPress={onNewReel}
          textColor={theme.text}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(320)}>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Dein Projekt ist gespeichert – du findest es jederzeit in der Übersicht.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.large,
    paddingBottom: spacing.xxlarge,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.large,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.small,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 380,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    backgroundColor: colors.black,
    marginBottom: spacing.large,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xlarge,
    marginBottom: spacing.large,
  },
  actionWrapper: {
    alignItems: 'center',
    gap: spacing.xsmall,
    minWidth: 72,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    textAlign: 'center',
  },
});
