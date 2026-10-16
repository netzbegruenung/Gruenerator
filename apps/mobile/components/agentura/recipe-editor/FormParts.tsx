import { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, colors, spacing, typography } from '../../../theme';
import { ListGroup } from '../../common';

/** Eine Gruppe des Formulars: Überschrift, Karte, Hinweis- oder Fehlerzeile. */
export function FormSection({
  title,
  children,
  footer,
  error,
}: {
  title?: string;
  children: ReactNode;
  footer?: string | null;
  error?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.title, { color: theme.textSecondary }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <ListGroup>{children}</ListGroup>
      {error ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </View>
      ) : footer ? (
        <Text style={[styles.footer, { color: theme.textSecondary }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

/** Eingabefeld innerhalb einer `FormSection`-Karte. */
export function FieldInput({ style, multiline, ...props }: TextInputProps) {
  const theme = useTheme();
  return (
    <RNTextInput
      placeholderTextColor={theme.textSecondary}
      multiline={multiline}
      style={[styles.input, { color: theme.text }, multiline && styles.multiline, style]}
      {...props}
    />
  );
}

/** Zeichenzähler rechtsbündig unter einem Feld. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const theme = useTheme();
  const over = value.length > max;
  return (
    <Text
      style={[styles.count, { color: over ? colors.semantic.error : theme.textSecondary }]}
      accessibilityLabel={`${value.length} von ${max} Zeichen`}
    >
      {value.length.toLocaleString('de-DE')} / {max.toLocaleString('de-DE')}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.xsmall },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xsmall,
  },
  footer: {
    ...typography.caption,
    paddingHorizontal: spacing.xsmall,
  },
  error: {
    ...typography.bodySmall,
    color: colors.semantic.error,
    paddingHorizontal: spacing.xsmall,
  },
  input: {
    ...typography.body,
    paddingHorizontal: spacing.small,
    paddingVertical: 12,
    minHeight: 48,
  },
  multiline: {
    minHeight: 160,
    textAlignVertical: 'top',
  },
  count: {
    ...typography.caption,
    textAlign: 'right',
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.xsmall,
  },
});
