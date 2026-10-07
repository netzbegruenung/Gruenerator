import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

export interface SegmentedOption {
  value: string;
  /** Announced to screen readers. */
  label: string;
  /** Shown in the segment. */
  short: string;
  disabled: boolean;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  /** null: nothing selected. */
  value: string | null;
  onChange: (value: string) => void;
  /** Names the group for screen readers. */
  accessibilityLabel: string;
}

/** A native-style segmented control: one choice out of a few, all visible. */
export function SegmentedControl({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: theme.buttonBackground }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            style={[
              styles.segment,
              selected && [styles.selected, { backgroundColor: theme.card }],
              option.disabled && styles.disabled,
            ]}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled: option.disabled }}
          >
            <Text
              style={[styles.text, { color: theme.text }, selected && styles.selectedText]}
              numberOfLines={1}
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
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  selected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  disabled: { opacity: 0.4 },
  text: { fontFamily: BODY_FONT, fontSize: 12 },
  selectedText: { fontWeight: '700' },
});
