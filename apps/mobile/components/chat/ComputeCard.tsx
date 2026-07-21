import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { ComputeData } from '@gruenerator/chat';

/**
 * Inline card for a deterministic calculation (compute intent) — native
 * counterpart of web's ComputeCard. The numbers were computed in plain JS on
 * the server (or via run_python on a capable client), not guessed by the
 * model; the card makes that provenance visible. File exports (`data.files`)
 * are web-only downloads and intentionally not rendered here.
 */
export function ComputeCard({ data, theme }: { data: ComputeData; theme: Theme }) {
  return (
    <View
      style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}
      accessibilityLabel={`Berechnung: ${data.operation}`}
    >
      <View style={styles.header}>
        <View style={styles.iconPill}>
          <Ionicons name="calculator-outline" size={15} color={colors.primary[500]} />
        </View>
        <Text style={[styles.operation, { color: theme.text }]} numberOfLines={1}>
          {data.operation}
        </Text>
        <Text style={[styles.caption, { color: theme.textSecondary }]}>EXAKT BERECHNET</Text>
      </View>
      {data.figures?.map((figure, index) => (
        <Image
          // Index key on purpose: every PNG shares the same base64 prefix.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          source={{ uri: `data:image/png;base64,${figure}` }}
          style={[styles.figure, { borderColor: theme.border }]}
          contentFit="contain"
          accessibilityLabel={`Diagramm ${index + 1}`}
        />
      ))}
      <View>
        {data.entries.map((entry, index) =>
          // Collapsed tabular output (pivot tables, df prints) lands as one
          // multi-line value — render it as a block, not a squashed row.
          entry.value.includes('\n') || entry.value.length > 120 ? (
            <View
              key={`${entry.label}-${index}`}
              style={[styles.blockRow, index > 0 && { borderTopColor: theme.border }]}
            >
              <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{entry.label}</Text>
              <Text style={[styles.blockValue, { color: theme.text }]}>{entry.value}</Text>
            </View>
          ) : (
            <View
              key={`${entry.label}-${index}`}
              style={[styles.row, index > 0 && { borderTopColor: theme.border }]}
            >
              <Text
                style={[styles.rowLabel, styles.rowLabelInline, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>
              <Text style={[styles.rowValue, { color: theme.text }]}>{entry.value}</Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginBottom: spacing.xsmall,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.small,
    backgroundColor: colors.primary[500] + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operation: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  caption: {
    marginLeft: 'auto',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  figure: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderRadius: borderRadius.small,
    marginBottom: spacing.xsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  blockRow: {
    paddingVertical: spacing.xxsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  rowLabel: {
    fontSize: 12,
  },
  rowLabelInline: {
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  blockValue: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
