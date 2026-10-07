import { type CreatorTweakWire } from '@gruenerator/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, colors, spacing } from '../../../theme';
import { BottomSheet } from '../../common/BottomSheet';
import { SegmentedControl } from '../../common/SegmentedControl';

/** The colour tweak: drawn as swatches instead of a segmented control. */
const COLOUR_TWEAK = 'farbe';
/** More options than this and a control needs the full row. */
const HALF_ROW_OPTIONS = 3;

interface FinishSheetProps {
  visible: boolean;
  onClose: () => void;
  tweaks: CreatorTweakWire[];
  tweaked: boolean;
  onTweak: (id: string, value: string) => void;
  onReset: () => void;
}

/** "Feinschliff": the design choices of the current draft. */
export function FinishSheet({
  visible,
  onClose,
  tweaks,
  tweaked,
  onTweak,
  onReset,
}: FinishSheetProps) {
  const theme = useTheme();
  const colour = tweaks.find((t) => t.id === COLOUR_TWEAK) ?? null;
  const others = tweaks.filter((t) => t.id !== COLOUR_TWEAK);

  return (
    <BottomSheet visible={visible} onClose={onClose} padded>
      <View style={styles.header}>
        <Pressable
          onPress={onReset}
          disabled={!tweaked}
          style={[styles.headerSide, !tweaked && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !tweaked }}
        >
          <Text style={[styles.reset, { color: theme.textGreen }]}>Zurücksetzen</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Feinschliff
        </Text>
        <Pressable
          onPress={onClose}
          style={[styles.headerSide, styles.headerEnd]}
          accessibilityRole="button"
        >
          <Text style={[styles.done, { color: theme.textGreen }]}>Fertig</Text>
        </Pressable>
      </View>

      {colour && (
        <View
          style={styles.swatches}
          accessibilityRole="radiogroup"
          accessibilityLabel={colour.label}
        >
          {colour.options.map((option) => {
            const selected = option.value === colour.value;
            const fills = option.swatch ?? [];
            return (
              <Pressable
                key={option.value}
                onPress={() => onTweak(colour.id, option.value)}
                disabled={option.disabled}
                style={[
                  styles.ring,
                  { borderColor: selected ? colors.primary[600] : 'transparent' },
                  option.disabled && styles.disabled,
                ]}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected, disabled: option.disabled }}
              >
                <View style={styles.swatch}>
                  {fills.map((fill, half) => (
                    <View
                      // eslint-disable-next-line react/no-array-index-key -- a half's position is its identity; both halves may share a colour
                      key={half}
                      style={[styles.fill, { backgroundColor: fill }]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.grid}>
        {others.map((t) => (
          <View
            key={t.id}
            style={[styles.cell, t.options.length > HALF_ROW_OPTIONS && styles.cellWide]}
          >
            <Text style={[styles.label, { color: theme.textSecondary }]}>{t.label}</Text>
            <SegmentedControl
              options={t.options}
              value={t.value}
              onChange={(value) => onTweak(t.id, value)}
              accessibilityLabel={t.label}
            />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const SWATCH = 44;
const RING_GAP = 2;
const RING = 2;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.medium },
  headerSide: { flex: 1, minHeight: 44, justifyContent: 'center' },
  headerEnd: { alignItems: 'flex-end' },
  reset: { fontFamily: BODY_FONT, fontSize: 15 },
  title: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700' },
  done: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  swatches: {
    // Seven swatches (de-DE + "Wechsel") are wider than a 375-pt phone: wrap instead of clipping.
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.xxsmall,
    rowGap: spacing.xsmall,
    marginBottom: spacing.medium,
  },
  ring: {
    padding: RING_GAP,
    borderWidth: RING,
    borderRadius: (SWATCH + 2 * (RING_GAP + RING)) / 2,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.35)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cell: { width: '48%', gap: 6 },
  cellWide: { width: '100%' },
  label: { fontFamily: BODY_FONT, fontSize: 12 },
});
