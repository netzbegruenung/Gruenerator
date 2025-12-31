import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { ChipGroup } from '../common';
import { SHAREPIC_TYPES, type SharepicType } from '@gruenerator/shared/sharepic';
import { spacing, lightTheme, darkTheme, typography } from '../../theme';

interface SharepicTypeSelectorProps {
  selected: SharepicType;
  onSelect: (type: SharepicType) => void;
}

const SHAREPIC_TYPE_OPTIONS = SHAREPIC_TYPES.map((t) => ({
  id: t.id,
  label: t.shortLabel,
}));

export function SharepicTypeSelector({ selected, onSelect }: SharepicTypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>Sharepic-Typ</Text>
      <ChipGroup<SharepicType>
        options={SHAREPIC_TYPE_OPTIONS}
        selected={selected}
        onSelect={(value) => {
          if (!Array.isArray(value)) {
            onSelect(value);
          }
        }}
        multiSelect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  label: {
    ...typography.body,
    fontWeight: '500',
  },
});
