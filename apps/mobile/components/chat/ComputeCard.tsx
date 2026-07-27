import { useChatConfigStore } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';

import { base64ToBytes, shareBytesAsFile } from '../../services/share';
import { colors, spacing, borderRadius, BODY_FONT } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { ComputeData } from '@gruenerator/chat';

/**
 * Inline card for a deterministic calculation (compute intent) — native
 * counterpart of web's ComputeCard. The numbers were computed in plain JS on
 * the server (or via run_python on a capable client), not guessed by the
 * model; the card makes that provenance visible.
 *
 * File exports (a filled form, a CSV) are offered through the native share
 * sheet — the app has no download folder concept, so "share" IS the download.
 * `fileAssets` are server-stored and behind an authenticated endpoint, so they
 * go through the configured chat fetch (Bearer on mobile), exactly like web's
 * ComputeCard; `files` carry their bytes inline.
 */
export function ComputeCard({ data, theme }: { data: ComputeData; theme: Theme }) {
  const [busy, setBusy] = useState<string | null>(null);

  const shareAsset = useCallback(async (name: string, url: string) => {
    setBusy(name);
    try {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch(url, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      await shareBytesAsFile(new Uint8Array(buffer), name);
    } catch (error) {
      console.error('[ComputeCard] asset share failed:', error);
      Alert.alert('Fehler', 'Die Datei konnte nicht geladen werden.');
    } finally {
      setBusy(null);
    }
  }, []);

  const shareInline = useCallback(async (name: string, b64: string) => {
    setBusy(name);
    try {
      await shareBytesAsFile(base64ToBytes(b64), name);
    } catch (error) {
      console.error('[ComputeCard] file share failed:', error);
      Alert.alert('Fehler', 'Die Datei konnte nicht geteilt werden.');
    } finally {
      setBusy(null);
    }
  }, []);

  const fileChip = (name: string, onPress: () => void) => (
    <Pressable
      key={name}
      onPress={onPress}
      disabled={busy != null}
      accessibilityRole="button"
      accessibilityLabel={`${name} teilen`}
      style={[styles.chip, { borderColor: theme.border }]}
    >
      {busy === name ? (
        <ActivityIndicator size="small" color={colors.primary[500]} />
      ) : (
        <Ionicons name="document-outline" size={14} color={colors.primary[500]} />
      )}
      <Text style={[styles.chipLabel, { color: theme.text }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );

  const hasFiles = (data.fileAssets?.length ?? 0) > 0 || (data.files?.length ?? 0) > 0;

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
      {hasFiles && (
        <View style={styles.chipRow}>
          {data.fileAssets?.map((file) =>
            fileChip(file.name, () => void shareAsset(file.name, file.url))
          )}
          {data.files?.map((file) =>
            fileChip(file.name, () => void shareInline(file.name, file.b64))
          )}
        </View>
      )}
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
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
  caption: {
    marginLeft: 'auto',
    fontFamily: BODY_FONT,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    marginBottom: spacing.xsmall,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
  },
  chipLabel: {
    flexShrink: 1,
    fontFamily: BODY_FONT,
    fontSize: 12,
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
    fontFamily: BODY_FONT,
    fontSize: 12,
  },
  rowLabelInline: {
    flexShrink: 1,
  },
  rowValue: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  blockValue: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
