import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { colors, spacing, lightTheme, darkTheme } from '../../theme';

/**
 * Section heading (title + optional pill badge) — the mobile echo of the web
 * workplace `SectionHeading` used across the Arbeiten tab.
 */
export function ToolSectionHeading({ title, badge }: { title: string; badge?: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <View style={styles.headingRow}>
      <Text style={[styles.headingTitle, { color: theme.text }]}>{title}</Text>
      {badge ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: isDark ? colors.secondary[900] : colors.secondary[50] },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: isDark ? colors.secondary[300] : colors.secondary[600] },
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginBottom: spacing.small,
  },
  headingTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 12,
  },
});
