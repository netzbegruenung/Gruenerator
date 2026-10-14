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
 * Bewusst ohne Aktionsmenü: Anlegen, Bearbeiten und Teilen passieren am
 * Rechner. Die einzige Aktion ist „Zu meinen Grüneratoren" (`added`), ein
 * eigener Knopf NEBEN der Kachel statt in ihr — ein Pressable fasst auf iOS
 * seine Kinder zu einem VoiceOver-Element zusammen, ein verschachtelter Knopf
 * wäre dort unerreichbar.
 */
export function MarketCard({
  icon,
  title,
  meta,
  description,
  onPress,
  added = null,
  onToggleAdded,
}: {
  icon: IoniconsIconName;
  title: string;
  meta: string;
  description?: string;
  onPress: () => void;
  /** `null` = nichts anzubieten (Eigenes); sonst, ob es in „Meine Grüneratoren" liegt. */
  added?: boolean | null;
  onToggleAdded?: () => void;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const offersToggle = added !== null && onToggleAdded !== undefined;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={meta}
        style={({ pressed }) => [
          styles.content,
          offersToggle && styles.contentWithToggle,
          { opacity: pressed ? 0.7 : 1 },
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
      {offersToggle ? (
        <Pressable
          onPress={onToggleAdded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            added ? `${title} aus meinen Grüneratoren entfernen` : `${title} zu meinen Grüneratoren`
          }
          accessibilityState={{ selected: added === true }}
          style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons
            name={added ? 'checkmark-circle' : 'add-circle-outline'}
            size={26}
            color={added ? theme.textGreen : theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // iOS trägt die weichere Ecke, Android die kantigere — wie im Entwurf.
    borderRadius: Platform.select({ ios: 16, default: 12 }),
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: spacing.medium,
    gap: spacing.small,
  },
  // Platz für den Knopf oben rechts, damit ein langer Titel nicht darunter läuft.
  contentWithToggle: {
    paddingRight: spacing.medium + 34,
  },
  toggle: {
    position: 'absolute',
    top: spacing.medium,
    right: spacing.medium,
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
