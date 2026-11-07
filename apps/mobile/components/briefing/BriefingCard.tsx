import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';

/** Die sechs Karten des Briefings; die Id steht als `?karte=` in der Route. */
export const BRIEFING_CARDS = [
  'themen',
  'keywords',
  'trends',
  'wichtig',
  'gruene',
  'landesverbaende',
] as const;
export type BriefingCardId = (typeof BRIEFING_CARDS)[number];

/**
 * Die Karte, die `?karte=` beim Start öffnen soll — oder `null` bei einem unbekannten
 * Wert oder einer Karte, die es hier nicht gibt (Landesverbände unter `at`).
 */
export function parseBriefingCard(
  value: string | string[] | undefined,
  available: readonly BriefingCardId[]
): BriefingCardId | null {
  const id = Array.isArray(value) ? value[0] : value;
  return available.find((card) => card === id) ?? null;
}

/** Was jede Karte vom Screen bekommt: ob sie offen ist und wie sie umschaltet. */
export interface BriefingCardState {
  id: BriefingCardId;
  open: boolean;
  onToggle: () => void;
}

/**
 * Hülle einer Briefing-Karte: Kopf als Aufklapp-Knopf, darunter der Inhalt. Die Karte
 * entscheidet selbst, was sie ein- und ausgeklappt zeigt. `more` setzt unten zusätzlich
 * „Mehr/Weniger“ — nur, wenn es auch mehr gibt.
 */
export function BriefingCard({
  state,
  title,
  more = false,
  busy = false,
  children,
}: {
  state: BriefingCardState;
  title: string;
  more?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  const reduceMotion = useReduceMotion();

  const toggle = () => {
    void Haptics.selectionAsync();
    state.onToggle();
  };

  return (
    <View
      aria-busy={busy}
      style={[
        styles.card,
        { backgroundColor: c.card },
        state.open ? { boxShadow: `inset 0 0 0 2px ${c.mg}` } : null,
      ]}
    >
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: state.open }}
        style={styles.head}
      >
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {title}
        </Text>
        <Animated.View
          style={{
            transform: [{ rotate: state.open ? '180deg' : '0deg' }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : 200,
          }}
        >
          <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
        </Animated.View>
      </Pressable>
      <View>{children}</View>
      {more ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${state.open ? 'Weniger' : 'Mehr'} anzeigen`}
          accessibilityState={{ expanded: state.open }}
          style={styles.more}
        >
          <Text style={[styles.moreText, { color: c.mg }]}>{state.open ? 'Weniger' : 'Mehr'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  head: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flexShrink: 1, fontFamily: HEADING_FONT_BOLD, fontSize: 20 },
  more: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  moreText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
});
