import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';

import { BODY_FONT, borderRadius, colors, darkTheme, lightTheme, spacing } from '../../theme';

/**
 * Regal-Reiter und Typ-Filter des Marktes.
 *
 * Beide Reihen scrollen waagerecht: vier Regalnamen und fünf Filter passen auf
 * keinem Telefon nebeneinander, und ein Umbruch auf zwei Zeilen schöbe die
 * Karten unter die Falz.
 *
 * Die Lautstärke ist Absicht und unterscheidet die beiden: das Regal ist die
 * Entscheidung und trägt Grün, der Typ verengt nur darin und bleibt grau.
 *
 * Das Grün des aktiven Reiters ist `secondary[600]`, nicht `primary[500]`:
 * weiße Schrift erreicht darauf 4,65:1 statt 3,73:1. Dieselbe Paarung trägt
 * der primäre Knopf, und im Web fiel genau diese Stelle durch die
 * axe-Prüfung.
 */
export function ShelfTabs<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: readonly { id: T; label: string; icon: IoniconsIconName }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const selected = option.id === active;
        const background = selected
          ? colors.secondary[600]
          : isDark
            ? theme.surface
            : colors.primary[50];
        const tint = selected ? colors.white : isDark ? theme.text : colors.primary[800];
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.shelf, { backgroundColor: background }]}
          >
            <Ionicons name={option.icon} size={16} color={tint} />
            <Text style={[styles.shelfLabel, { color: tint }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TypeFilterRow<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.typeRow}
      style={styles.scroller}
    >
      {options.map((option) => {
        const selected = option.id === active;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.type, selected && { backgroundColor: theme.surface }]}
          >
            <Text
              style={[
                styles.typeLabel,
                { color: selected ? theme.text : theme.textSecondary },
                selected && styles.typeLabelActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /**
   * Eine waagerechte `ScrollView` dehnt sich in einer Spalte trotzdem in die
   * Höhe und nimmt der Kartenliste den Platz weg. `flexGrow: 0` hält sie auf
   * der Höhe ihres Inhalts.
   */
  scroller: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  shelf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.medium,
    // Die Kapsel ist iOS, die gerundete Ecke Android — wie im Entwurf.
    borderRadius: Platform.select({ ios: borderRadius.full, default: 10 }),
  },
  shelfLabel: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  typeRow: {
    gap: 2,
    paddingHorizontal: spacing.medium,
  },
  type: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
  },
  typeLabel: {
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
  typeLabelActive: {
    fontWeight: '600',
  },
});
