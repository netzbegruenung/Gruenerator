import { type ProfilbildAssetSrc } from '@gruenerator/shared/profilbild';
import { Canvas, Group, Rect, rect, rrect, type SkImage } from '@shopify/react-native-skia';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';

import { ProfilbildScene } from './ProfilbildScene';
import { sceneScale, type ProfilbildModel } from './sceneModel';

export type PreviewVariant = 'rund' | 'quadrat' | 'instagram';

const SCRIM_OPACITY = 0.5;
const AVATAR = 86;

const circle = (size: number) => rrect(rect(0, 0, size, size), size / 2, size / 2);

export function PreviewFrame({
  variant,
  viewSize,
  children,
}: {
  variant: PreviewVariant;
  viewSize: number;
  children: ReactNode;
}) {
  return (
    <View style={{ width: viewSize, height: viewSize }}>
      {children}
      {variant === 'rund' ? (
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
          </Canvas>
        </View>
      ) : null}
    </View>
  );
}

const STATS = [
  ['12', 'Beiträge'],
  ['340', 'Follower'],
  ['180', 'Gefolgt'],
] as const;

interface InstagramPreviewProps {
  model: ProfilbildModel;
  person: SkImage;
  images: Record<ProfilbildAssetSrc, SkImage>;
  isAustria: boolean;
}

export function InstagramPreview({ model, person, images, isAustria }: InstagramPreviewProps) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Vorschau als Instagram-Profilbild"
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
    >
      <Text style={[styles.heading, { color: theme.text }]}>So sieht es auf Instagram aus</Text>
      <View style={styles.profile}>
        <Canvas style={styles.avatar}>
          <Group clip={circle(AVATAR)}>
            <Group transform={[{ scale: sceneScale(AVATAR) }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heading: { ...typography.bodySmall, fontWeight: '600' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  avatar: { width: AVATAR, height: AVATAR },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  value: { ...typography.bodySmall, fontWeight: '600' },
  label: { ...typography.caption },
  bio: { ...typography.bodySmall },
});
