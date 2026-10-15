import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View, useColorScheme } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { useTheme } from '../../../hooks/useTheme';
import {
  BODY_FONT,
  HEADING_FONT_BOLD,
  borderRadius,
  colors,
  spacing,
  typography,
} from '../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../theme/layout';
import { getMarkdownStyles } from '../../chat/markdownStyles';
import { Button, SkeletonRows, useSurfaceStyles } from '../../common';
import { AgentGlyph } from '../AgentGlyph';

/**
 * Bausteine der Grüneratoren-Detailseiten und ihrer Teilen-Seiten: gruppierte
 * Abschnitte statt der Tabs aus dem Web, eine Spalte mit Lesebreite.
 */

/** Teilt einen Web-Link über das System-Teilen-Menü (darin auch „Kopieren"). */
export function shareLink(url: string, title: string): void {
  // iOS hängt `message` und `url` aneinander; Android kennt nur `message`.
  void Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }).catch(
    () => {}
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: theme.textSecondary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Kopf im Inhalt: Symbol auf getönter Fläche, Titel (bricht um), Zeilen darunter. */
export function DetailHero({
  iconKey,
  title,
  lines,
}: {
  iconKey: string | null;
  title: string;
  lines: readonly (string | null)[];
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.hero}>
      <View
        style={[
          styles.glyphTile,
          { backgroundColor: isDark ? colors.grey[800] : colors.secondary[100] },
        ]}
      >
        <AgentGlyph
          iconKey={iconKey}
          size={30}
          color={isDark ? colors.secondary[300] : colors.secondary[700]}
        />
      </View>
      <View style={styles.heroText}>
        <Text style={[styles.heroTitle, { color: theme.text }]} selectable>
          {title}
        </Text>
        {lines.filter(Boolean).map((line) => (
          <Text key={line} style={[styles.heroLine, { color: theme.textSecondary }]} selectable>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Fließtext in einer Karte; ab `collapseAfter` Zeichen eingeklappt mit „Mehr anzeigen". */
/**
 * Ein Textblock in einer Karte, ab `collapseAfter` Zeichen eingeklappt.
 * `markdown` rendert wie das Web (Beschreibung, Begrüßung der Agents) — ohne
 * `numberOfLines`, darum klappt es dann am Zeichen statt an der Zeile ein.
 */
export function TextCard({
  text,
  collapseAfter = 600,
  markdown = false,
}: {
  text: string;
  collapseAfter?: number;
  markdown?: boolean;
}) {
  const theme = useTheme();
  const { card } = useSurfaceStyles();
  const long = text.length > collapseAfter;
  const [expanded, setExpanded] = useState(false);
  const folded = long && !expanded;
  return (
    <View style={[styles.card, card]}>
      {markdown ? (
        <Markdown style={getMarkdownStyles(theme)}>
          {folded ? `${text.slice(0, collapseAfter).trimEnd()} …` : text}
        </Markdown>
      ) : (
        <Text
          style={[styles.body, { color: theme.text }]}
          selectable
          {...(folded ? { numberOfLines: 10 } : {})}
        >
          {text}
        </Text>
      )}
      {long ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={[styles.moreText, { color: theme.textGreen }]}>
            {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Eine Zeile mit umbrechendem Text — für Einstiegsfragen, die ListRow auf eine Zeile kürzen würde. */
export function WrappingRow({
  icon,
  text,
  onPress,
  last,
}: {
  icon: IoniconsIconName;
  text: string;
  onPress: () => void;
  last: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={({ pressed }) => [
        styles.wrapRow,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.textGreen} />
      <Text style={[styles.wrapText, { color: theme.text }]}>{text}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

export function HeaderIconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: IoniconsIconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={color ?? theme.text} />
    </Pressable>
  );
}

export function HeaderButtons({ children }: { children: ReactNode }) {
  return <View style={styles.headerButtons}>{children}</View>;
}

/** Laden, Fehler, nicht gefunden — eine Fläche mit Satz und optionalem Knopf. */
export function DetailState({
  kind,
  message,
  actionLabel,
  onAction,
}: {
  kind: 'loading' | 'message';
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  if (kind === 'loading') {
    return (
      <View style={[styles.column, styles.stateBox]}>
        <SkeletonRows count={4} leading={56} />
      </View>
    );
  }
  return (
    <View style={[styles.column, styles.stateBox, styles.stateCenter]}>
      <Text style={[styles.stateText, { color: theme.textSecondary }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button variant="outline" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

/** Kurzer Hinweis unter einer Gruppe — leerer Zustand, Erklärung. */
export function Hint({ children, tone }: { children: string; tone?: 'error' }) {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.hint,
        { color: tone === 'error' ? colors.semantic.error : theme.textSecondary },
      ]}
    >
      {children}
    </Text>
  );
}

export const detailStyles = StyleSheet.create({
  scrollContent: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge * 2,
    gap: spacing.large,
  },
  actions: { gap: spacing.xsmall },
});

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  section: { gap: spacing.xsmall },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xsmall,
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  glyphTile: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.xlarge,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, minWidth: 0, gap: 2 },
  heroTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 24, lineHeight: 29 },
  heroLine: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 19 },
  card: {
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    padding: spacing.medium,
    gap: spacing.xsmall,
  },
  body: { ...typography.body, fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
  more: { alignSelf: 'flex-start' },
  moreText: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  wrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: 12,
  },
  wrapText: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, lineHeight: 21 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  headerButton: { padding: 4 },
  stateBox: { padding: spacing.medium, gap: spacing.medium },
  stateCenter: { alignItems: 'center', paddingTop: spacing.xxlarge },
  stateText: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  hint: { fontFamily: BODY_FONT, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.xsmall },
  pressed: { opacity: 0.6 },
});
