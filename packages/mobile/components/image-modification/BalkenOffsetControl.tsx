import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  MODIFICATION_CONTROLS_CONFIG,
  MODIFICATION_LABELS,
  type BalkenOffset,
} from '@gruenerator/shared/image-studio';

interface BalkenOffsetControlProps {
  offsets: BalkenOffset;
  onOffsetsChange: (offsets: BalkenOffset) => void;
  disabled?: boolean;
}

const LINE_LABELS = [
  MODIFICATION_LABELS.LINE_1,
  MODIFICATION_LABELS.LINE_2,
  MODIFICATION_LABELS.LINE_3,
];

export function BalkenOffsetControl({
  offsets,
  onOffsetsChange,
  disabled = false,
}: BalkenOffsetControlProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { min, max, step } = MODIFICATION_CONTROLS_CONFIG.balkenOffset;

  const handleOffsetChange = (index: number, direction: -1 | 1) => {
    if (disabled) return;

    const newOffsets = [...offsets] as BalkenOffset;
    const newValue = newOffsets[index] + direction * step;
    newOffsets[index] = Math.max(min, Math.min(max, newValue));
    onOffsetsChange(newOffsets);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>
        {MODIFICATION_LABELS.BALKEN_POSITION}
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {MODIFICATION_LABELS.BALKEN_POSITION_DESC}
      </Text>

      <View style={styles.rowsContainer}>
        {offsets.map((offset, index) => (
          <View key={index} style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {LINE_LABELS[index]}
            </Text>

            <View style={styles.controls}>
              <Pressable
                onPress={() => handleOffsetChange(index, -1)}
                disabled={disabled || offset <= min}
                style={[
                  styles.arrowButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  (disabled || offset <= min) && styles.buttonDisabled,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={disabled || offset <= min ? theme.textSecondary : colors.primary[600]}
                />
              </Pressable>

              <View style={[styles.valueDisplay, { backgroundColor: theme.surface }]}>
                <Text style={[styles.valueText, { color: theme.text }]}>
                  {offset > 0 ? `+${offset}` : offset}px
                </Text>
              </View>

              <Pressable
                onPress={() => handleOffsetChange(index, 1)}
                disabled={disabled || offset >= max}
                style={[
                  styles.arrowButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  (disabled || offset >= max) && styles.buttonDisabled,
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={disabled || offset >= max ? theme.textSecondary : colors.primary[600]}
                />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
  },
  rowsContainer: {
    gap: spacing.small,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  valueDisplay: {
    minWidth: 64,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.small,
    alignItems: 'center',
  },
  valueText: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
