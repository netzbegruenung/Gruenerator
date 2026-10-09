import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { type VorlagenGridSize } from '../../stores/preferencesStore';
import { colors } from '../../theme';

export interface VorlagenHeaderActionsProps {
  /** Label of the active filter, or null while „Alle Vorlagen" is shown. */
  filterLabel: string | null;
  onOpenFilter: () => void;
  /** Hidden under „Meine Vorlagen", like web. */
  showListControls: boolean;
  onlyBookmarked: boolean;
  onToggleBookmarked: () => void;
  gridSize: VorlagenGridSize;
  onToggleGridSize: () => void;
}

/** The icons top right on the Vorlagen screen, in web's order. */
export function VorlagenHeaderActions({
  filterLabel,
  onOpenFilter,
  showListControls,
  onlyBookmarked,
  onToggleBookmarked,
  gridSize,
  onToggleGridSize,
}: VorlagenHeaderActionsProps) {
  const theme = useTheme();
  const filtered = filterLabel !== null;

  return (
    <View style={styles.row}>
      {showListControls && (
        <Pressable
          onPress={onToggleBookmarked}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Nur gemerkte Vorlagen"
          accessibilityState={{ selected: onlyBookmarked }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons
            name={onlyBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={onlyBookmarked ? colors.primary[600] : theme.text}
          />
        </Pressable>
      )}
      <Pressable
        onPress={onOpenFilter}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={filtered ? `Filter: ${filterLabel}` : 'Filter'}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons
          name={filtered ? 'funnel' : 'funnel-outline'}
          size={21}
          color={filtered ? colors.primary[600] : theme.text}
        />
        {filtered && <View testID="filter-dot" style={styles.dot} />}
      </Pressable>
      {showListControls && (
        <Pressable
          onPress={onToggleGridSize}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Große Kacheln"
          accessibilityState={{ selected: gridSize === 'large' }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons
            name={gridSize === 'large' ? 'grid-outline' : 'apps-outline'}
            size={21}
            color={theme.text}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[600],
  },
});
