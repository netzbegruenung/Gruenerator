import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';

interface RunPythonCardProps {
  args: Record<string, unknown>;
  result?: unknown;
  theme: Theme;
}

/**
 * Native card for run_python tool parts — mostly cross-device thread history
 * (the code ran on web; mobile declares no run_python capability, so it never
 * executes here). Mirrors web's RunPythonToolUI: a status line with the code
 * collapsed behind "Code anzeigen"; the numeric result renders via the
 * separate ComputeCard (metadata.computeData).
 */
export function RunPythonCard({ args, result, theme }: RunPythonCardProps) {
  const [expanded, setExpanded] = useState(false);

  const code = typeof args.code === 'string' ? args.code : '';
  const error =
    result != null && typeof result === 'object' && 'error' in result
      ? String((result as { error: unknown }).error)
      : null;
  const done = result !== undefined;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        {!done ? (
          <ActivityIndicator size="small" color={colors.primary[500]} />
        ) : error ? (
          <Ionicons name="warning-outline" size={14} color="#f5a623" />
        ) : (
          <Ionicons name="checkmark" size={14} color={colors.primary[500]} />
        )}
        <Text style={[styles.label, { color: theme.text }]}>Tabellen-Berechnung</Text>
        <Text style={[styles.status, { color: theme.textSecondary }]} numberOfLines={1}>
          {!done ? 'wird ausgeführt…' : error ? 'fehlgeschlagen' : 'abgeschlossen'}
        </Text>
        {code !== '' && (
          <Pressable onPress={() => setExpanded((x) => !x)} style={styles.toggle}>
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color={theme.textSecondary}
            />
            <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>
              {expanded ? 'Code verbergen' : 'Code anzeigen'}
            </Text>
          </Pressable>
        )}
      </View>
      {error && (
        <Text style={[styles.error, { borderTopColor: theme.border }]} numberOfLines={4}>
          {error}
        </Text>
      )}
      {expanded && code !== '' && (
        <ScrollView horizontal style={[styles.codeWrap, { borderTopColor: theme.border }]}>
          <Text style={[styles.code, { color: theme.text }]}>{code}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  status: {
    flexShrink: 1,
    fontSize: 12,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  toggleLabel: {
    fontSize: 11,
  },
  error: {
    fontSize: 12,
    color: '#d97706',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  codeWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    padding: spacing.small,
  },
});
