/**
 * BalkenOffsetControl - Image studio bar offset control
 * Uses Zustand selector for performance
 * Note: This control has a unique UI (3 rows of steppers) so it doesn't delegate to a generic component
 */

import { useCallback } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { OffsetStepper } from '../ui/controls';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { spacing, lightTheme, darkTheme } from '../../theme';
import {
  MODIFICATION_CONTROLS_CONFIG,
  MODIFICATION_LABELS,
  type BalkenOffset,
} from '@gruenerator/shared/image-studio';

const LINE_LABELS = [
  MODIFICATION_LABELS.LINE_1,
  MODIFICATION_LABELS.LINE_2,
  MODIFICATION_LABELS.LINE_3,
];

interface BalkenOffsetControlProps {
  disabled?: boolean;
}

export function BalkenOffsetControl({ disabled = false }: BalkenOffsetControlProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // Zustand selectors - only re-render when these specific values change
  const offsets = useImageStudioStore(
    (s) => (s.modifications as { balkenOffset?: BalkenOffset } | null)?.balkenOffset ?? [0, 0, 0]
  );
  const updateModification = useImageStudioStore((s) => s.updateModification);

  const { min, max, step } = MODIFICATION_CONTROLS_CONFIG.balkenOffset;

  const handleOffsetChange = useCallback(
    (index: number, newValue: number) => {
      const newOffsets = [...offsets] as BalkenOffset;
      newOffsets[index] = newValue;
      updateModification('balkenOffset', newOffsets);
    },
    [offsets, updateModification]
  );

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
          <OffsetStepper
            key={index}
            value={offset}
            onChange={(v) => handleOffsetChange(index, v)}
            min={min}
            max={max}
            step={step}
            label={LINE_LABELS[index]}
            disabled={disabled}
          />
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
});
