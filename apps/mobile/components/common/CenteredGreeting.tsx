import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { darkTheme, lightTheme, spacing, HEADING_FONT_BOLD } from '../../theme';

/** The large centred greeting above a docked composer — the start page's
 *  „Hallo …“ and a notebook's „Berlin / Was möchtest du wissen?“. */
export function CenteredGreeting({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const { isTablet } = useLayout();
  return (
    <View style={styles.hero}>
      <Text style={[styles.greeting, isTablet && styles.greetingWide, { color: theme.text }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.greeting, isTablet && styles.greetingWide, { color: theme.textSecondary }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
  },
  greeting: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 28,
    textAlign: 'center',
  },
  greetingWide: {
    fontSize: 32,
  },
});
