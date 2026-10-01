import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { borderRadius, colors, darkTheme, lightTheme, spacing, BODY_FONT } from '../../theme';

/**
 * A failed load on Arbeiten, said where the missing sections would be. Inline
 * rather than taking over the screen: the tiles above still work, and the other
 * half of the page (office or media) may have loaded fine.
 *
 * A failed request must never read as an empty account — that is why the old
 * Arbeiten and Studio tabs each had one, and why this one exists.
 */
export function LoadErrorNotice({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Ionicons name="cloud-offline-outline" size={24} color={colors.error[500]} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      </View>
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.retry,
          { backgroundColor: colors.primary[600], opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={styles.retryText}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
  retry: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  retryText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
