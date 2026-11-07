import { StyleSheet, View } from 'react-native';

import { useDashboardColors } from '../../theme';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

import { AsideCard, CARD_GAP, PAGE_GAP, SliderCard } from './WissenLayout';

// Ladezustände des Wissen-Screens: Platzhalter in der Form des späteren Inhalts, damit
// beim Eintreffen nichts springt. Die Balken kommen aus `components/common/Skeleton.tsx`
// (Pulse, „Bewegung reduzieren“, Screenreader überspringen sie), nur in der Farbe des Dashboards.

function Bone({
  width,
  height,
  radius = 6,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  const c = useDashboardColors();
  return (
    <SkeletonBar
      width={width}
      height={height}
      radius={radius}
      style={{ backgroundColor: c.skeleton }}
    />
  );
}

export function SliderSkeleton() {
  return (
    <SkeletonGroup style={styles.slider}>
      <Bone width={192} height={14} />
      <Bone width="92%" height={24} />
      <Bone width="60%" height={24} />
      <View style={styles.dots}>
        <Bone width={22} height={8} radius={4} />
        {[0, 1, 2].map((i) => (
          <Bone key={i} width={8} height={8} radius={4} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

export function PollSkeleton() {
  return (
    <SkeletonGroup style={styles.stack}>
      <Bone width={112} height={40} />
      <Bone width="100%" height={34} />
    </SkeletonGroup>
  );
}

export function TrendsSkeleton() {
  return (
    <SkeletonGroup style={styles.trends}>
      {(['50%', '40%', '60%'] as const).map((w) => (
        <View key={w} style={styles.trend}>
          <Bone width={w} height={16} />
          <Bone width="100%" height={4} radius={2} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Platzhalter für die Notebook-Kacheln. */
export function ShelfSkeleton() {
  const c = useDashboardColors();
  return (
    <SkeletonGroup style={styles.shelf}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.shelfTile, { backgroundColor: c.mgTint }]}>
          <SkeletonBar width="75%" height={20} style={{ backgroundColor: c.mgTint2 }} />
          <SkeletonBar width="50%" height={14} style={{ backgroundColor: c.mgTint2 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Der Screen vor den ersten Daten: Karten in ihrer Form. */
export function WissenSkeleton() {
  return (
    <View style={{ gap: PAGE_GAP }}>
      <SliderCard>
        <View style={styles.sliderHead}>
          <Bone width={96} height={16} />
        </View>
        <SliderSkeleton />
      </SliderCard>
      <View style={styles.row}>
        <AsideCard>
          <Bone width={96} height={16} />
          <TrendsSkeleton />
        </AsideCard>
        <AsideCard>
          <Bone width={96} height={16} />
          <PollSkeleton />
        </AsideCard>
      </View>
      <ShelfSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  sliderHead: { paddingHorizontal: 18, paddingTop: 18 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stack: { gap: CARD_GAP },
  trends: { gap: 9 },
  trend: { gap: 4 },
  row: { flexDirection: 'row', gap: CARD_GAP },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  shelfTile: {
    flexBasis: '45%',
    flexGrow: 1,
    maxWidth: '50%',
    minHeight: 84,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 16,
    justifyContent: 'flex-end',
    gap: 6,
  },
});
