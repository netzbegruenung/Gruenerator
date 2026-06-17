import { Pressable, Text, StyleSheet } from 'react-native';

import { colors } from '../../theme';

/**
 * Inline citation badge — the native counterpart of web's circular superscript
 * `CitationBadge`. A real fixed-size round View (not a styled inline-Text span,
 * which Android draws as a tight rectangle ignoring borderRadius), so it renders
 * as a true filled bubble. Embedded inline inside the markdown text run via RN's
 * new-architecture inline-View-in-Text support.
 */
export function CitationBadge({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: number | string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      style={styles.bubble}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const SIZE = 18;

const styles = StyleSheet.create({
  bubble: {
    minWidth: SIZE,
    height: SIZE,
    paddingHorizontal: 5,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    // Nudge up so it reads as a superscript marker next to the text baseline.
    transform: [{ translateY: -1 }],
  },
  label: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
