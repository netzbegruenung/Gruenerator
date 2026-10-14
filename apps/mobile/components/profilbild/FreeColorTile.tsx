import { PRIDE_STRIPES, type FreeBackground } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { HEADING_FONT_BOLD, borderRadius, colors, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

import { FlatFill } from './FlatFill';
import {
  freeColorGrid,
  freeDefaults,
  GRADIENT_DIRECTIONS,
  type PaletteColor,
} from './freeColorModel';

const GRID = freeColorGrid();
const RAINBOW = [...PRIDE_STRIPES, PRIDE_STRIPES[0]] as unknown as readonly [
  string,
  string,
  ...string[],
];

/** One colour: the country's CD colours as quick picks, then the free grid. */
function ColorField({
  label,
  value,
  palette,
  onChange,
}: {
  label: string;
  value: string;
  palette: PaletteColor[];
  onChange(hex: string): void;
}) {
  const theme = useTheme();
  const ring = (selected: boolean) => ({
    borderColor: selected ? theme.textGreen : 'transparent',
  });
  return (
    <View accessibilityLabel={label} style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.quickRow}>
        {palette.map((c) => (
          <Pressable
            key={c.hex}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: value === c.hex }}
            onPress={() => onChange(c.hex)}
            style={[styles.quickRing, ring(value === c.hex)]}
          >
            <View
              style={[styles.quick, { backgroundColor: c.hex, borderColor: theme.cardBorder }]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.grid}>
        {GRID.map((row) => (
          <View key={row[0]} style={styles.gridRow}>
            {row.map((hex) => (
              <Pressable
                key={hex}
                accessibilityRole="button"
                accessibilityLabel={`Farbe ${hex}`}
                accessibilityState={{ selected: value === hex }}
                onPress={() => onChange(hex)}
                style={[
                  styles.cell,
                  { backgroundColor: hex },
                  value === hex && { borderColor: theme.text, borderWidth: 2 },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Tile „Eigene Farbe“ or „Eigener Verlauf“ at the end of its row. It shows the
 * free choice once there is one; the sheet offers the CD colours first.
 */
export function FreeColorTile({
  mode,
  value,
  selected,
  palette,
  size,
  onChange,
}: {
  mode: 'color' | 'gradient';
  /** The current free choice, when it fits this mode. */
  value: FreeBackground | null;
  selected: boolean;
  palette: PaletteColor[];
  size: number;
  onChange(bg: FreeBackground): void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const label = mode === 'color' ? 'Eigene Farbe' : 'Eigener Verlauf';
  const { color, gradient } = freeDefaults(value, palette);
  const [from, to] = gradient.stops;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => {
          // A free colour chosen before applies again on tap.
          if (value) onChange(value);
          setOpen(true);
        }}
        style={[
          styles.tileRing,
          { borderColor: selected ? theme.textGreen : 'transparent', borderRadius: size },
        ]}
      >
        <View
          style={[
            styles.tile,
            { width: size, height: size, borderRadius: size / 2, borderColor: theme.cardBorder },
          ]}
        >
          {value ? (
            <FlatFill background={value} />
          ) : (
            <>
              <LinearGradient
                colors={RAINBOW}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.plus}>
                <Ionicons name="add" size={16} color={colors.grey[800]} />
              </View>
            </>
          )}
        </View>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} padded maxHeight="90%">
        <ScrollView contentContainerStyle={styles.sheet}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {label}
          </Text>
          {mode === 'color' ? (
            <ColorField
              label="Farbe"
              value={color}
              palette={palette}
              onChange={(hex) => onChange({ kind: 'color', color: hex })}
            />
          ) : (
            <>
              <ColorField
                label="Von"
                value={from}
                palette={palette}
                onChange={(hex) => onChange({ ...gradient, stops: [hex, to] })}
              />
              <ColorField
                label="Nach"
                value={to}
                palette={palette}
                onChange={(hex) => onChange({ ...gradient, stops: [from, hex] })}
              />
              <View accessibilityLabel="Richtung" style={styles.directions}>
                {GRADIENT_DIRECTIONS.map((d) => {
                  const active = gradient.angle === d.angle;
                  return (
                    <Pressable
                      key={d.angle}
                      accessibilityRole="button"
                      accessibilityLabel={d.label}
                      accessibilityState={{ selected: active }}
                      onPress={() => onChange({ ...gradient, angle: d.angle })}
                      style={[
                        styles.direction,
                        {
                          borderColor: active ? theme.textGreen : theme.border,
                          backgroundColor: active ? theme.buttonBackground : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons
                        name="arrow-down"
                        size={18}
                        color={theme.text}
                        style={{ transform: [{ rotate: `${d.rotate}deg` }] }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <Button onPress={() => setOpen(false)}>Fertig</Button>
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const QUICK = 32;

const styles = StyleSheet.create({
  tileRing: { borderWidth: 2, padding: 2 },
  tile: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { gap: spacing.medium, paddingBottom: spacing.small },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 20 },
  field: { gap: spacing.xsmall },
  fieldLabel: { ...typography.caption, fontWeight: '600' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxsmall },
  quickRing: { borderWidth: 2, padding: 2, borderRadius: borderRadius.full },
  quick: {
    width: QUICK,
    height: QUICK,
    borderRadius: QUICK / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: { borderRadius: borderRadius.medium, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, borderColor: 'transparent' },
  directions: { flexDirection: 'row', gap: spacing.xsmall },
  direction: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
