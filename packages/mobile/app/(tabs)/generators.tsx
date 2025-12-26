import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { lightTheme, darkTheme, typography, spacing } from '../../theme';

/**
 * Generators screen
 * List of available text generators
 */
export default function GeneratorsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Textgeneratoren
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Wähle einen Generator für deinen Anwendungsfall
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
});
