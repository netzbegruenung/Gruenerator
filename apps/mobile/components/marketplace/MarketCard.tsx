import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image, type ImageSource } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { BODY_FONT, darkTheme, lightTheme, spacing } from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';

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
 * „Zu meinen Grüneratoren" (`added`) ist ein eigener Knopf NEBEN der Kachel
 * statt in ihr — ein Pressable fasst auf iOS seine Kinder zu einem
 * VoiceOver-Element zusammen, ein verschachtelter Knopf wäre dort unerreichbar.
 * Weitere Aktionen (Bearbeiten, Teilen, Löschen) hängen am langen Druck;
 * VoiceOver erreicht sie über die benannte Aktion „Aktionen".
 *
 * Im Marktplatz trägt dieselbe Karte jede Art: Vorlagen, Sticker und
 * Hintergründe zeigen statt des Symbols ihr Bild (`image`), und ihr Knopf
 * merkt sie („Merken", `toggle="bookmark"`) statt sie zu den Grüneratoren zu
 * holen.
 */
export function MarketCard({
  iconKey,
  title,
  meta,
  description,
  onPress,
  onLongPress,
  added = null,
  onToggleAdded,
  image = null,
  imageFit = 'cover',
  toggle = 'library',
}: {
  iconKey: string | null;
  title: string;
  meta: string;
  description?: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** `null` = nichts anzubieten (Eigenes); sonst, ob es in „Meine Grüneratoren" liegt. */
  added?: boolean | null;
  onToggleAdded?: () => void;
  /** Ein Vorschaubild statt des Symbols. */
  image?: ImageSource | null;
  /** `contain` für freigestellte Sticker. */
  imageFit?: 'cover' | 'contain';
  /** `bookmark`: der Knopf merkt statt „Zu meinen Grüneratoren". */
  toggle?: 'library' | 'bookmark';
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const offersToggle = added !== null && onToggleAdded !== undefined;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={meta}
        accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Aktionen' }] : []}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') onLongPress?.();
        }}
        style={({ pressed }) => [
          styles.content,
          offersToggle && styles.contentWithToggle,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={styles.header}>
          {image ? (
            <View style={[styles.imageChip, { backgroundColor: theme.backgroundAlt }]}>
              <Image
                source={image}
                contentFit={imageFit}
                style={imageFit === 'contain' ? styles.imageContain : StyleSheet.absoluteFill}
                accessibilityIgnoresInvertColors
              />
            </View>
          ) : (
            <View style={[styles.iconChip, { backgroundColor: theme.backgroundAlt }]}>
              <AgentGlyph iconKey={iconKey} size={20} color={theme.text} />
            </View>
          )}
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
            toggle === 'bookmark'
              ? added
                ? `${title} nicht mehr merken`
                : `${title} merken`
              : added
                ? `${title} aus meinen Grüneratoren entfernen`
                : `${title} zu meinen Grüneratoren`
          }
          accessibilityState={{ selected: added === true }}
          style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons
            name={
              toggle === 'bookmark'
                ? added
                  ? 'bookmark'
                  : 'bookmark-outline'
                : added
                  ? 'checkmark-circle'
                  : 'add-circle-outline'
            }
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
  imageChip: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContain: {
    width: 48,
    height: 48,
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
