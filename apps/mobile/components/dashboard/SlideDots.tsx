import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDashboardColors } from '../../theme';

/** Zielfläche eines Punkts: 44 pt hoch, 32 pt breit — sechs Punkte plus Pause-Knopf passen so in die Karte. */
const DOT_HIT = { height: 44, minWidth: 32 } as const;

/**
 * Punkte unter den Folien; der aktive ist lang. Jeder Punkt springt zu seiner
 * Folie — die Alternative zum Wischen (WCAG 2.5.1). Der aktive Punkt ist für
 * Screenreader ein Schieber (`increment`/`decrement` = nächste/vorige Folie),
 * die übrigen sind Knöpfe.
 *
 * `memo` mit stabilem `onSelect`: ein Folienwechsel rendert nur die Punkte, nicht die Karte.
 */
export const SlideDots = memo(function SlideDots({
  labels,
  active,
  onSelect,
}: {
  /** Zugänglicher Name je Punkt, z. B. „Meldung 2 von 4“. */
  labels: string[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const c = useDashboardColors();
  return (
    <View style={styles.row}>
      {labels.map((label, i) => {
        const isActive = i === active;
        return (
          <Pressable
            key={label}
            onPress={() => onSelect(i)}
            accessibilityRole={isActive ? 'adjustable' : 'button'}
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            accessibilityActions={
              isActive
                ? [
                    { name: 'increment', label: 'Nächste Folie' },
                    { name: 'decrement', label: 'Vorherige Folie' },
                  ]
                : undefined
            }
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment') onSelect(i + 1);
              else if (e.nativeEvent.actionName === 'decrement') onSelect(i - 1);
            }}
            style={styles.hit}
          >
            <View
              style={[
                styles.dot,
                isActive ? styles.dotActive : null,
                { backgroundColor: isActive ? c.mg : c.mgDot },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  hit: { ...DOT_HIT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22 },
});
