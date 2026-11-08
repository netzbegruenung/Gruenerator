import { StyleSheet, View } from 'react-native';

import { useDashboardColors } from '../../theme';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

// Platzhalter des Briefings in der Form des späteren Inhalts. Die Balken kommen aus
// `components/common/Skeleton.tsx` (Pulse, „Bewegung reduzieren“, Screenreader überspringen
// sie), nur in der Farbe des Dashboards.

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

/** Der Leitsatz im Ladezustand: zwei Zeilen. */
export function LeadSkeleton() {
  return (
    <SkeletonGroup style={styles.lead}>
      <Bone width="100%" height={26} />
      <Bone width="60%" height={26} />
    </SkeletonGroup>
  );
}

/** Themen: Name und grauer Balken. */
export function RowsSkeleton() {
  return (
    <SkeletonGroup style={styles.rows}>
      {(['100%', '60%', '45%', '33%', '25%'] as const).map((w) => (
        <View key={w} style={styles.row}>
          <Bone width={112} height={16} />
          <View style={styles.rowBar}>
            <Bone width={w} height={6} radius={3} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const CLOUD: [number, number][] = [
  [96, 32],
  [80, 24],
  [56, 24],
  [128, 24],
  [88, 20],
  [96, 20],
  [48, 16],
  [64, 16],
];

/** Keywords und X-Trends: eine Wolke aus Wortbreiten. */
export function CloudSkeleton() {
  return (
    <SkeletonGroup style={styles.cloud}>
      {CLOUD.map(([w, h]) => (
        <Bone key={`${w}x${h}`} width={w} height={h} />
      ))}
    </SkeletonGroup>
  );
}

/** Nachrichtenkarten: drei Meldungen aus Quelle, Titel und halber Zeile. */
export function NewsSkeleton() {
  return (
    <SkeletonGroup style={styles.news}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.item}>
          <Bone width={160} height={12} />
          <Bone width="100%" height={20} />
          <Bone width="66%" height={20} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  lead: { gap: 12 },
  rows: { gap: 16 },
  rowBar: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 },
  news: { gap: 26 },
  item: { gap: 8 },
});
