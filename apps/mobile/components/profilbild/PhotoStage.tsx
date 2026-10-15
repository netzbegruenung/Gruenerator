import { PROFILBILD_SIZE } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Canvas, Group, rect, rrect, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Button } from '../common/Button';

import { BackgroundLayer } from './ProfilbildScene';
import { type MobileBackground } from './sceneModel';

import type { CutoutState } from '../../hooks/profilbild/useProfilbildCutout';

const PREVIEW = 72;
/** Brand green at 12 % over white — web's `color-mix(in srgb, #46962b 12%, white)`. */
const LIGHT_STAGE = '#e9f2e6';

/** The chosen background as a round preview with a person silhouette in front. */
function BackgroundPreview({
  background,
  images,
  isAustria,
}: {
  background: MobileBackground;
  images: Partial<Record<string, SkImage>>;
  isAustria: boolean;
}) {
  const scale = PREVIEW / PROFILBILD_SIZE;
  return (
    <View style={styles.preview}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group clip={rrect(rect(0, 0, PREVIEW, PREVIEW), PREVIEW / 2, PREVIEW / 2)}>
          <Group transform={[{ scale }]}>
            <BackgroundLayer background={background} images={images} isAustria={isAustria} />
          </Group>
        </Group>
      </Canvas>
      <Ionicons name="person" size={60} color="rgba(255, 255, 255, 0.9)" style={styles.person} />
    </View>
  );
}

/** What the stage carries before there is a person: upload, cutting out, or its error. */
export function PhotoStage({
  size,
  state,
  background,
  images,
  isAustria,
  pendingHint,
  onRetry,
  onReset,
}: {
  size: number;
  state: Exclude<CutoutState, { status: 'ready' }>;
  background: MobileBackground;
  images: Partial<Record<string, SkImage>>;
  isAustria: boolean;
  pendingHint: string | null;
  onRetry(): void;
  onReset(): void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const frame = [styles.stage, { width: size, height: size }];

  if (state.status === 'working') {
    return (
      <View style={[frame, styles.centered]}>
        <Image source={{ uri: state.source.uri }} contentFit="cover" style={styles.fill} />
        <View style={[styles.fill, styles.dim]} />
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.workingText}>Person wird freigestellt…</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={[frame, styles.centered, { backgroundColor: theme.surface }]}>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
          {state.message}
        </Text>
        <View style={styles.buttons}>
          <Button onPress={onRetry}>Erneut versuchen</Button>
          <Button variant="outline" onPress={onReset}>
            Anderes Foto
          </Button>
        </View>
      </View>
    );
  }

  // Light instead of filled with the chosen background: that shows as a round
  // preview with a silhouette, the way the finished Profilbild will look. The
  // photo itself is picked below the stage (RecentPhotos).
  return (
    <View style={[frame, { backgroundColor: dark ? colors.grey[800] : LIGHT_STAGE }]}>
      <View style={styles.zone}>
        <BackgroundPreview background={background} images={images} isAustria={isAustria} />
        <Text style={[styles.title, { color: theme.text }]}>Dein Foto kommt hierher</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {pendingHint ?? 'Wähle unten ein Foto – am besten ein Porträt'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: borderRadius.xlarge, overflow: 'hidden', padding: spacing.small },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.medium },
  zone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    padding: spacing.medium,
  },
  preview: {
    width: PREVIEW,
    height: PREVIEW,
    borderRadius: PREVIEW / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colors.grey[200],
  },
  person: { marginBottom: -8 },
  title: { ...typography.bodyBold, textAlign: 'center' },
  subtitle: { ...typography.caption, textAlign: 'center' },
  buttons: { width: '100%', maxWidth: 280, gap: spacing.xsmall, marginTop: spacing.xsmall },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { backgroundColor: colors.black, opacity: 0.55 },
  workingText: { ...typography.bodyBold, color: colors.white },
  error: { ...typography.body, textAlign: 'center' },
});
