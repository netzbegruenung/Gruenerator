import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';

/** Grid of cards, or one row per item. */
export type ViewMode = 'grid' | 'list';

/**
 * The grid/list switch, shared by the Arbeiten and Studio tabs.
 *
 * It shows the mode you would switch TO, not the one you are in — the icon is a
 * verb here, not a status. That is how it already behaved in Arbeiten; naming it
 * once keeps Studio from quietly picking the opposite convention.
 *
 * Sized like the other header controls (40x40) so swapping it against the
 * profile menu does not shift the title.
 */
export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const theme = useTheme();
  const next: ViewMode = mode === 'grid' ? 'list' : 'grid';
  return (
    <Pressable
      onPress={() => onChange(next)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={next === 'list' ? 'Als Liste anzeigen' : 'Als Raster anzeigen'}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons
        name={next === 'list' ? 'list-outline' : 'grid-outline'}
        size={22}
        color={theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
