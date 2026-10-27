import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing } from '../../theme';

import { AgentGlyph, PHOSPHOR_GLYPHS, type PhosphorGlyphKey } from './AgentGlyph';

const KEYS = Object.keys(PHOSPHOR_GLYPHS) as PhosphorGlyphKey[];

/**
 * Symbolwahl für Agents und Rezepte. Gespeichert wird der Web-Name
 * (`PiSparkle`), damit das Symbol im Web dasselbe ist. Ein im Web gewähltes
 * Symbol außerhalb der mobilen Auswahl bleibt gespeichert, solange hier keins
 * angetippt wird — es steht dann vorne in der Liste.
 */
export function IconPickerGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (iconKey: string) => void;
}) {
  const theme = useTheme();
  const keys: string[] = KEYS.includes(value as PhosphorGlyphKey) ? KEYS : [value, ...KEYS];

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {keys.map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={key.replace(/^Pi/, '')}
            style={({ pressed }) => [
              styles.cell,
              {
                backgroundColor: selected ? colors.secondary[600] : theme.backgroundAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <AgentGlyph iconKey={key} size={26} color={selected ? colors.white : theme.text} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  cell: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
