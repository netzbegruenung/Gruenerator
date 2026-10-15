import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, HEADING_FONT_SEMIBOLD } from '../../theme';

export interface SegmentedOption {
  value: string;
  /** Announced to screen readers. */
  label: string;
  /** Shown in the segment. */
  short: string;
  disabled: boolean;
  /** Shown before the label. */
  icon?: ComponentProps<typeof Ionicons>['name'];
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  /** null: nothing selected. */
  value: string | null;
  onChange: (value: string) => void;
  /** Names the group for screen readers. */
  accessibilityLabel: string;
}

/**
 * One choice out of a few, all visible: web's pill pair — outlined pills of
 * equal width, the chosen one filled Eucalyptus.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps) {
  const theme = useTheme();
  const outline = useColorScheme() === 'dark' ? colors.grey[700] : colors.grey[200];
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        const color = selected ? colors.white : theme.text;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              // The tick of a native segmented control — only when the choice
              // actually moves, so re-tapping the selected segment stays silent.
              if (!selected) void Haptics.selectionAsync();
              onChange(option.value);
            }}
            disabled={option.disabled}
            style={({ pressed }) => [
              styles.pill,
              selected
                ? { backgroundColor: colors.secondary[600], borderColor: colors.secondary[600] }
                : {
                    borderColor: outline,
                    backgroundColor: pressed ? theme.surface : 'transparent',
                  },
              option.disabled && styles.disabled,
            ]}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled: option.disabled }}
          >
            {option.icon ? <Ionicons name={option.icon} size={16} color={color} /> : null}
            <Text
              style={[styles.text, { color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {option.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xsmall },
  pill: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 40,
    gap: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
  },
  disabled: { opacity: 0.4 },
  text: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 14, flexShrink: 1 },
});
