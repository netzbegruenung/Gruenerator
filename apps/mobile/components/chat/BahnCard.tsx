import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { spacing, borderRadius, chatType } from '../../theme';

import { buildBahnCardView, type BahnRow } from './bahnCardView';

import type { Theme } from '../../theme/colors';
import type { BahnPayload } from '@gruenerator/contracts';

/** Deutsche Bahn's house red — the one colour here that is not a theme token. */
const DB_RED = '#EC0016';

function DepartureRow({ row, theme, isFirst }: { row: BahnRow; theme: Theme; isFirst: boolean }) {
  return (
    <View
      style={[styles.row, !isFirst && { borderTopColor: theme.border, borderTopWidth: 1 }]}
      accessibilityLabel={`${row.time} ${row.label} nach ${row.destination}`}
    >
      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: theme.text }]}>{row.time}</Text>
        {row.platform ? (
          <Text style={[styles.platform, { color: theme.textSecondary }]}>Gl. {row.platform}</Text>
        ) : null}
      </View>
      <View
        style={[styles.lineBadge, { borderColor: theme.border, backgroundColor: theme.surface }]}
      >
        <Text style={[styles.lineBadgeText, { color: theme.text }]}>{row.label}</Text>
      </View>
      <View style={styles.destinationColumn}>
        <Text style={[styles.destination, { color: theme.text }]} numberOfLines={1}>
          {row.destination}
        </Text>
        {row.via.length > 0 ? (
          <Text style={[styles.via, { color: theme.textSecondary }]} numberOfLines={1}>
            über {row.via.join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Native counterpart of web's `BahnCard`: the condensed departure board a
 * `bahn` turn produces (system MCP source, DB IRIS timetables). Presentational
 * only — the payload arrives on the `bahn` SSE event and is rehydrated from the
 * persisted tool step on reload.
 *
 * All of the deciding happens in `bahnCardView`, so this file is layout.
 */
export const BahnCard = memo(function BahnCard({
  data,
  theme,
}: {
  data: BahnPayload;
  theme: Theme;
}) {
  const view = useMemo(() => buildBahnCardView(data), [data]);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityLabel={`Deutsche Bahn: Abfahrten ${view.station}`}
    >
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>DB</Text>
        </View>
        <Text style={[styles.station, { color: theme.text }]} numberOfLines={1}>
          {view.station} · {view.subtitle}
        </Text>
      </View>
      {view.date ? (
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} />
          <Text style={[styles.date, { color: theme.textSecondary }]}>{view.date}</Text>
        </View>
      ) : null}

      {view.isEmpty ? (
        <View style={styles.emptyRow}>
          <Ionicons name="train-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Keine Züge im abgefragten Zeitfenster gefunden.
          </Text>
        </View>
      ) : (
        view.rows.map((row, index) => (
          <DepartureRow key={row.id} row={row} theme={theme} isFirst={index === 0} />
        ))
      )}

      {view.hiddenCount > 0 ? (
        <Text style={[styles.more, { color: theme.textSecondary }]}>
          + {view.hiddenCount} weitere Züge
        </Text>
      ) : null}

      <Text style={[styles.source, { color: theme.textSecondary, borderTopColor: theme.border }]}>
        Quelle: Deutsche Bahn (IRIS-Fahrplandaten) · Sollzeiten ohne Gewähr
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    padding: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.large,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.small,
    backgroundColor: DB_RED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    ...chatType.chatMeta,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  station: {
    ...chatType.chatTitle,
    flex: 1,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginTop: spacing.xxsmall,
  },
  date: {
    ...chatType.chatMeta,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  timeColumn: {
    width: 52,
    alignItems: 'center',
  },
  time: {
    ...chatType.chatTitle,
    fontWeight: '700',
  },
  platform: {
    ...chatType.chatMicro,
    marginTop: 1,
  },
  lineBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.small,
    paddingHorizontal: spacing.xxsmall,
    paddingVertical: 1,
  },
  lineBadgeText: {
    ...chatType.chatMicro,
    fontWeight: '700',
  },
  destinationColumn: {
    flex: 1,
    minWidth: 0,
  },
  destination: {
    ...chatType.chatSecondary,
  },
  via: {
    ...chatType.chatMicro,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
  },
  empty: {
    ...chatType.chatSecondary,
    flex: 1,
  },
  more: {
    ...chatType.chatMicro,
    paddingTop: spacing.xxsmall,
  },
  source: {
    ...chatType.chatMicro,
    marginTop: spacing.xsmall,
    paddingTop: spacing.xxsmall,
    borderTopWidth: 1,
  },
});
