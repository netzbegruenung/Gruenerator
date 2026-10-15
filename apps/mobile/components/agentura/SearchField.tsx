import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing } from '../../theme';

/** Das runde Suchfeld der Übersicht und der Agentura. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="search" size={18} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Suche zurücksetzen"
        >
          <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 15,
    paddingVertical: 0,
  },
});
