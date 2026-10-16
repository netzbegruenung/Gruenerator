import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, spacing } from '../../../theme';

const clampDay = (d: number) => Math.min(31, Math.max(1, d));

/** Tag im Monat (1–31) mit Minus/Plus — eine Liste mit 31 Zeilen wäre zu lang. */
export function MonthDayStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (day: number) => void;
}) {
  const theme = useTheme();
  const step = (delta: number) => onChange(clampDay(value + delta));

  const button = (delta: number, icon: 'remove' | 'add', label: string, disabled: boolean) => (
    <Pressable
      onPress={() => step(delta)}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundAlt, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
    </Pressable>
  );

  return (
    <View
      style={styles.line}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Tag im Monat"
      accessibilityValue={{ text: `${value}. des Monats` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <Text style={[styles.label, { color: theme.text }]}>Am {value}. des Monats</Text>
      <View style={styles.row}>
        {button(-1, 'remove', 'Einen Tag früher', value <= 1)}
        {button(1, 'add', 'Einen Tag später', value >= 31)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: 8,
    minHeight: 48,
  },
  label: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '500',
  },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
