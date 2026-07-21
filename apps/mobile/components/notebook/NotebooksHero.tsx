import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { spacing, lightTheme, darkTheme } from '../../theme';

/**
 * Minimal notebook hero — a big centered heading over the Wissen pink gradient,
 * mirroring the web notebook "2a" redesign. The composer itself is bottom-pinned
 * (see the Wissen screen's BottomComposerBar), ChatGPT-style.
 */
export function NotebooksHero() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.hero}>
      <Text style={[styles.title, { color: theme.text }]}>Was möchtest du wissen?</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Durchsucht alle Quellen parallel.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingTop: spacing.large,
    marginBottom: spacing.large,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 30,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xsmall,
    textAlign: 'center',
  },
});
