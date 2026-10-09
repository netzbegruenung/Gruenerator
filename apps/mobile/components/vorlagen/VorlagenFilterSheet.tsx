import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { ListRow, useSurfaceStyles } from '../common/ListRow';

export interface VorlagenFilter {
  id: string;
  label: string;
}

/** Picks what the Vorlagen grid shows: all, one category, or the user's own. */
export function VorlagenFilterSheet({
  visible,
  filters,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  filters: VorlagenFilter[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { card } = useSurfaceStyles();

  return (
    <BottomSheet visible={visible} onClose={onClose} padded backgroundColor={theme.surface}>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        Anzeigen
      </Text>
      <View style={[styles.card, card]}>
        {filters.map((f, i) => (
          <ListRow
            key={f.id}
            dense
            title={f.label}
            selected={f.id === selected}
            last={i === filters.length - 1}
            onPress={() => {
              onSelect(f.id);
              onClose();
            }}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h4, marginBottom: spacing.small },
  card: { borderRadius: 12, overflow: 'hidden', marginBottom: spacing.medium },
});
