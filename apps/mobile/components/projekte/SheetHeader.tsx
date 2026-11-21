import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, spacing } from '../../theme';

interface SheetHeaderProps {
  title: string;
  onCancel: () => void;
  actionLabel: string;
  /** Vorlesetext der Aktion, wenn er genauer sein soll als die Beschriftung. */
  actionAccessibilityLabel?: string;
  onAction: () => void;
  canAct: boolean;
  busy: boolean;
}

/**
 * Kopfleiste der Projekt-Sheets: Abbrechen | Titel | Aktion, wie die Leiste
 * eines iOS-Sheets.
 *
 * Gezeichnet im Sheet selbst, weil die native Kopfleiste dort nicht ankommt:
 * ein `formSheet` von react-native-screens zeigt keinen Header, und ein `modal`
 * im verschachtelten (focused)-Stack zeigte im Simulator ebenfalls keinen —
 * dann fehlte der einzige Weg zum Speichern.
 */
export function SheetHeader({
  title,
  onCancel,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  canAct,
  busy,
}: SheetHeaderProps) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: theme.border }]}>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Abbrechen"
        hitSlop={8}
        style={styles.side}
      >
        <Text style={[styles.text, { color: theme.text }]}>Abbrechen</Text>
      </Pressable>
      <Text
        style={[styles.title, { color: theme.text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Pressable
            onPress={onAction}
            disabled={!canAct}
            accessibilityRole="button"
            accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
            accessibilityState={{ disabled: !canAct }}
            hitSlop={8}
          >
            <Text
              style={[styles.text, styles.action, { color: theme.text, opacity: canAct ? 1 : 0.4 }]}
            >
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 80 },
  right: { alignItems: 'flex-end' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '600',
  },
  text: { fontFamily: BODY_FONT, fontSize: 17 },
  action: { fontWeight: '600' },
});
