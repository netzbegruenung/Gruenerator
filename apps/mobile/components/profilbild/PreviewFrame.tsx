import { Canvas, Circle, Group, Rect, rect, rrect, type SkImage } from '@shopify/react-native-skia';
import { type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';

import { ProfilbildScene } from './ProfilbildScene';
import { sceneScale, type ProfilbildModel, type SceneImages } from './sceneModel';

// Light enough that the corners of the square export stay readable.
const SCRIM_OPACITY = 0.2;
const GUIDE_OPACITY = 0.8;
const AVATAR_SHARE = 0.55;
const GRID_COLUMNS = 3;
const GRID_ROWS = 4;

const circle = (size: number) => rrect(rect(0, 0, size, size), size / 2, size / 2);

/**
 * The square export with its round crop marked: profiles show it round, the
 * file stays square, so the stage shows both.
 */
export function PreviewFrame({ viewSize, children }: { viewSize: number; children: ReactNode }) {
  const r = viewSize / 2;
  return (
    <View style={{ width: viewSize, height: viewSize }}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Canvas style={{ width: viewSize, height: viewSize }}>
          <Group clip={circle(viewSize)} invertClip>
            <Rect
              x={0}
              y={0}
              width={viewSize}
              height={viewSize}
              color={colors.black}
              opacity={SCRIM_OPACITY}
            />
          </Group>
          <Circle
            cx={r}
            cy={r}
            r={r - 0.75}
            style="stroke"
            strokeWidth={1.5}
            color={colors.white}
            opacity={GUIDE_OPACITY}
          />
        </Canvas>
      </View>
    </View>
  );
}

const STATS = [
  ['12', 'Beiträge'],
  ['340', 'Follower'],
  ['180', 'Gefolgt'],
] as const;

interface InstagramPeekProps {
  model: ProfilbildModel;
  person: SkImage;
  images: SceneImages;
  isAustria: boolean;
}

/**
 * The Profilbild on an Instagram-like profile page over the whole editor. The
 * avatar is drawn larger than Instagram does so the round crop can be judged;
 * the rest of the page is there for scale.
 */
export function InstagramPeek({ model, person, images, isAustria }: InstagramPeekProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const avatar = Math.round(width * AVATAR_SHARE);
  const tile = (width - spacing.medium * 2 - 2 * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Vorschau als Instagram-Profilbild"
      style={[styles.page, { backgroundColor: theme.background }]}
    >
      <Text style={[styles.handle, { color: theme.text }]}>dein.name</Text>
      <View style={styles.profile}>
        <Canvas style={{ width: avatar, height: avatar }}>
          <Group clip={circle(avatar)}>
            <Group transform={[{ scale: sceneScale(avatar) }]}>
              <ProfilbildScene
                model={model}
                person={person}
                images={images}
                isAustria={isAustria}
              />
            </Group>
          </Group>
        </Canvas>
        <View style={styles.stats}>
          {STATS.map(([value, label]) => (
            <View key={label} style={styles.stat}>
              <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View>
        <Text style={[styles.value, { color: theme.text }]}>Dein Name</Text>
        <Text style={[styles.bio, { color: theme.textSecondary }]}>Deine Bio steht hier.</Text>
      </View>
      <View style={styles.buttons}>
        {['Folgen', 'Nachricht'].map((label) => (
          <View key={label} style={[styles.button, { backgroundColor: theme.surface }]}>
            <Text style={[styles.value, { color: theme.text }]}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, i) => (
          <View key={i} style={{ width: tile, height: tile, backgroundColor: theme.surface }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: spacing.medium, padding: spacing.medium },
  handle: { ...typography.bodyBold },
  profile: { alignItems: 'center', gap: spacing.medium },
  stats: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  value: { ...typography.bodySmall, fontWeight: '600' },
  label: { ...typography.caption },
  bio: { ...typography.bodySmall },
  buttons: { flexDirection: 'row', gap: spacing.small },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, overflow: 'hidden' },
});
