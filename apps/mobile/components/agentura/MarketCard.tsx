import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { BODY_FONT, darkTheme, lightTheme, spacing } from '../../theme';

/**
 * Die Marktkachel auf Mobil — dieselbe Form wie im Web, als Karte statt als
 * Listenzeile.
 *
 * Der Markt war hier eine gruppierte Liste (`ListGroup`/`ListRow`). Für zwei
 * Zeilen Text je Eintrag ist das die falsche Form: die Beschreibung ist das,
 * woran man einen Grünerator erkennt, und in einer Zeile mit Chevron bleibt
 * dafür kein Raum. Die Karte trägt Symbol, Titel, Meta-Zeile und zwei Zeilen
 * Beschreibung — und liest sich damit wie die Kachel im Web.
 *
 * Bewusst ohne Aktionsmenü: dieser Bildschirm ist lesend. Anlegen, Bearbeiten
 * und Favorisieren passieren am Rechner.
 */
export function MarketCard({
  icon,
  title,
  meta,
  description,
  onPress,
}: {
  icon: IoniconsIconName;
  title: string;
  meta: string;
  description?: string;
  onPress: () => void;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={meta}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconChip, { backgroundColor: theme.backgroundAlt }]}>
          <Ionicons name={icon} size={20} color={theme.text} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.medium,
    gap: spacing.small,
    // iOS trägt die weichere Ecke, Android die kantigere — wie im Entwurf.
    borderRadius: Platform.select({ ios: 16, default: 12 }),
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 21,
  },
});
