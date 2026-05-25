import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { spacing, lightTheme, darkTheme } from '../../theme';
import { ComposerCard } from '../common';

/**
 * Gallery hero — reuses the startpage's structure (welcome + ComposerCard). The
 * composer sends the question into the multi-source aggregate notebook's chat; the
 * screen owns the locale-aware target and wires it via `onSend`.
 */
export function NotebooksHero({ onSend }: { onSend: (text: string) => void }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.hero}>
      <Text style={[styles.title, { color: theme.text }]}>Was möchtest du wissen?</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Durchsucht Programme, Fraktionstexte und mehr – alle Quellen parallel.
      </Text>
      <View style={styles.composer}>
        <ComposerCard placeholder="Stell deine Frage an alle Quellen..." onSend={onSend} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.large,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xxsmall,
  },
  composer: {
    marginTop: spacing.medium,
  },
});
