import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { lightTheme, darkTheme, typography, spacing } from '../../theme';

/**
 * Chat/Home screen
 * Main chat interface for AI text generation
 */
export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Grünerator Chat
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        KI-gestützte Textgenerierung für Die Grünen
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
