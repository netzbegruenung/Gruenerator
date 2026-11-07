import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';

// Das Gerüst des Wissen-Screens — Kartenhüllen und Titel-Stil. Die echten Karten und
// ihre Skeletons bauen beide daraus, damit Abstände an genau einer Stelle stehen. Maße
// wie das Web in Handybreite (`apps/web/src/features/notebook/wissen/WissenLayout.tsx`).

/** Abstand der Blöcke im Screen und zwischen Trends und Umfragen. */
export const PAGE_GAP = 12;
export const CARD_GAP = 10;
export const CARD_PADDING = 18;

type CardProps = Pick<ViewProps, 'accessibilityLabel' | 'aria-busy' | 'testID'> & {
  children: ReactNode;
};

/** Weiße (dunkel: anthrazit) Karte des Kopf-Sliders. */
export function SliderCard({ children, ...rest }: CardProps) {
  const c = useDashboardColors();
  return (
    <View {...rest} style={[styles.sliderCard, { backgroundColor: c.card }]}>
      {children}
    </View>
  );
}

/** Kennzahl-Karte (Trends, Umfragen): gleich hohe Hälften einer Zeile. */
export function AsideCard({ children, ...rest }: CardProps) {
  const c = useDashboardColors();
  return (
    <View {...rest} style={[styles.asideCard, { backgroundColor: c.card }]}>
      {children}
    </View>
  );
}

/**
 * Titel einer Karte, zugleich ihr Link auf die volle Seite. `memo`: die Überschrift
 * ändert sich beim Folienwechsel nicht.
 */
export const AsideTitle = memo(function AsideTitle({
  title,
  onPress,
  hint,
}: {
  title: string;
  onPress: () => void;
  hint: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityHint={hint}
      // Die Zeile bleibt so hoch wie die Schrift; die Zielfläche reicht auf 44 pt.
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 24 }}
      style={styles.titleRow}
    >
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        {title}
      </Text>
    </Pressable>
  );
});

/**
 * Kleiner Hinweis unter einer Karte, wenn die Abfrage fehlschlug (Vorbild
 * `LoadErrorNotice`, nur ohne Kasten: die Karte ist schon der Kasten). Daten im Cache
 * bleiben darüber stehen; ein Fehler liest sich nie als „leer“.
 */
export function CardError({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={[styles.errorText, { color: theme.textSecondary }]}>
        Konnte nicht geladen werden.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      >
        <Text style={[styles.retry, { color: c.mg }]}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { gap: 4, alignItems: 'flex-start' },
  errorText: { fontFamily: BODY_FONT, fontSize: 13 },
  retry: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
  sliderCard: { borderRadius: 20, borderCurve: 'continuous', overflow: 'hidden' },
  asideCard: {
    flex: 1,
    gap: CARD_GAP,
    padding: CARD_PADDING,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  titleRow: { alignSelf: 'flex-start' },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 14, lineHeight: 20 },
});
