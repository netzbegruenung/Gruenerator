import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

/**
 * The notebook gallery card. One component for both system and user notebooks —
 * the optional `meta`/`subtitle` second line is what distinguishes them (system:
 * "542 Artikel"; user: "12 Dokumente · …"). Do not fork into two cards.
 */
export function NotebookCard({
  icon,
  title,
  meta,
  subtitle,
  onPress,
  onLongPress,
  isProcessing,
  trailing,
}: {
  icon: IoniconsIconName;
  title: string;
  meta?: string;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
  isProcessing?: boolean;
  /** Replaces the default chevron (e.g. a like button). A nested Pressable here
   *  captures the touch, so tapping it won't also fire the card's onPress. */
  trailing?: ReactNode;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const secondaryLine = subtitle ?? meta;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.primary[600]} />
      <View style={styles.textColumn}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {secondaryLine ? (
          <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
            {secondaryLine}
          </Text>
        ) : null}
      </View>
      {isProcessing ? (
        <ActivityIndicator size="small" color={colors.primary[600]} />
      ) : (
        (trailing ?? <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />)
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.xsmall,
    marginBottom: spacing.xxsmall,
  },
  textColumn: {
    flex: 1,
  },
  cardTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 11,
    marginTop: 1,
  },
});
