import { type MonitorLocale } from '@gruenerator/contracts';
import { type UmfragenRegion } from '@gruenerator/shared/monitor';
import { StyleSheet, View } from 'react-native';

import { GlanceHero } from './GlanceHero';
import { LaenderMapPanel } from './LaenderMapPanel';
import { SonntagsfrageBars } from './SonntagsfrageBars';
import { UmfragenCard } from './UmfragenCard';

/** Kopfzahl, Sonntagsfrage, Karte — für den Bund, Österreich oder ein einzelnes Land. */
export function UmfragenView({
  locale,
  region,
}: {
  locale: MonitorLocale;
  region: UmfragenRegion | null;
}) {
  const isAT = (region?.locale ?? locale) === 'at';
  const parliament = region?.parliament ?? (isAT ? 'oesterreich' : 'deutschland');
  const regionLabel = region?.label ?? (isAT ? 'Österreich' : 'Bund');
  const subtitle =
    region?.subtitle ??
    (isAT
      ? 'Wenn am nächsten Sonntag Nationalratswahl wäre …'
      : 'Wenn am nächsten Sonntag Wahl wäre …');

  return (
    <View style={styles.stack}>
      <GlanceHero parliament={parliament} regionLabel={regionLabel} />
      <UmfragenCard>
        <SonntagsfrageBars parliament={parliament} subtitle={subtitle} />
      </UmfragenCard>
      <UmfragenCard>
        <LaenderMapPanel locale={isAT ? 'at' : 'de'} />
      </UmfragenCard>
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: 16 } });
