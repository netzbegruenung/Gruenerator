import { StyleSheet, View } from 'react-native';

import { useDashboardColors } from '../../theme';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

// Platzhalter der Umfragen in der Form des späteren Inhalts (Maße wie die Web-Bones).

function Bone({
  width,
  height,
  radius = 6,
  aspectRatio,
}: {
  width: number | `${number}%`;
  height?: number;
  radius?: number;
  aspectRatio?: number;
}) {
  const c = useDashboardColors();
  return (
    <SkeletonBar
      width={width}
      height={height}
      aspectRatio={aspectRatio}
      radius={radius}
      style={{ backgroundColor: c.skeleton }}
    />
  );
}

/** Kopfzahl: Zeile, große Zahl, Satz. */
export function HeroSkeleton() {
  return (
    <SkeletonGroup style={styles.hero}>
      <Bone width={128} height={14} />
      <Bone width={192} height={64} />
      <Bone width="90%" height={16} />
    </SkeletonGroup>
  );
}

/** Sonntagsfrage: Titel und sechs Balken. */
export function BarsSkeleton() {
  return (
    <SkeletonGroup style={styles.bars}>
      <Bone width={160} height={24} />
      {(['100%', '80%', '60%', '50%', '40%', '25%'] as const).map((w) => (
        <Bone key={w} width={w} height={22} />
      ))}
    </SkeletonGroup>
  );
}

/** Karte in ihrem Seitenverhältnis (380 × 470). */
export function MapSkeleton() {
  return (
    <View style={styles.map}>
      <SkeletonGroup>
        <Bone width="100%" aspectRatio={380 / 470} radius={16} />
      </SkeletonGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 12 },
  bars: { gap: 14 },
  map: { maxWidth: 380, width: '100%' },
});
