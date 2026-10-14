import {
  type BarsBlock,
  type CalloutBlock,
  type CompareBlock,
  type StatsBlock,
  type StepsBlock,
  type TableBlock,
  type TimelineBlock,
  type VisualBlock,
  type VisualTone,
  barDisplay,
  barScale,
  calloutLabel,
  formatTableCell,
} from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { borderRadius, chatType, colors, spacing } from '../../../theme';
import { darkTheme, type Theme } from '../../../theme/colors';
import { ChatChartCard } from '../ChatChartCard';

/**
 * Native counterpart of web's VisualBlock: draws a parsed ```bars, ```stats, …
 * fence (see `chatVisualBlocks.ts` in contracts). Same content and order as
 * web; the table becomes one card per row, which is what web's DataTable does
 * on a narrow screen too.
 */
export function VisualBlockView({ visual, theme }: { visual: VisualBlock; theme: Theme }) {
  switch (visual.kind) {
    case 'chart':
      return (
        <View style={styles.outer}>
          <ChatChartCard
            data={{ ...visual.block, title: visual.block.title ?? '' }}
            theme={theme}
          />
          {visual.block.note ? <Note text={visual.block.note} theme={theme} /> : null}
        </View>
      );
    case 'bars':
      return <Bars block={visual.block} theme={theme} />;
    case 'stats':
      return <Stats block={visual.block} theme={theme} />;
    case 'callout':
      return <Callout block={visual.block} theme={theme} />;
    case 'timeline':
      return <Timeline block={visual.block} theme={theme} />;
    case 'steps':
      return <Steps block={visual.block} theme={theme} />;
    case 'compare':
      return <Compare block={visual.block} theme={theme} />;
    case 'table':
      return <Table block={visual.block} theme={theme} />;
  }
}

const isDark = (theme: Theme) => theme.background === darkTheme.background;

function accentText(theme: Theme) {
  return isDark(theme) ? colors.primary[300] : colors.primary[700];
}

function Note({ text, theme }: { text: string; theme: Theme }) {
  return <Text style={[styles.note, { color: theme.textSecondary }]}>{text}</Text>;
}

function Frame({
  title,
  note,
  theme,
  children,
}: {
  title?: string;
  note?: string;
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.outer,
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.background },
      ]}
    >
      {title ? (
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
      {note ? <Note text={note} theme={theme} /> : null}
    </View>
  );
}

function toneFill(tone: VisualTone, theme: Theme): string {
  const dark = isDark(theme);
  switch (tone) {
    case 'primary':
      return dark ? colors.primary[400] : colors.primary[600];
    case 'secondary':
      return dark ? colors.secondary[300] : colors.secondary[500];
    case 'accent':
      return dark ? '#D4A72C' : '#A8841C';
    case 'warning':
      return colors.semantic.warning;
    case 'danger':
      return dark ? colors.error[400] : colors.error[600];
    case 'neutral':
      return theme.textSecondary;
  }
}

function Bars({ block, theme }: { block: BarsBlock; theme: Theme }) {
  const geometry = barScale(block);
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={styles.list}>
        {block.items.map((item, i) => {
          const { start, end, open } = geometry(item);
          const display = barDisplay(item, block.unit);
          return (
            <View
              key={`${i}-${item.label}`}
              style={styles.barRow}
              accessible
              accessibilityLabel={`${item.label}: ${display}`}
            >
              <View style={styles.barLabels}>
                <Text style={[styles.label, { color: theme.text }]}>{item.label}</Text>
                <Text style={[styles.value, { color: theme.text }]}>{display}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.fill,
                    open && styles.openFill,
                    {
                      marginLeft: `${start}%`,
                      width: `${end - start}%`,
                      backgroundColor: toneFill(item.tone ?? 'primary', theme),
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Frame>
  );
}

const TREND_ICON = { up: 'arrow-up', down: 'arrow-down', flat: 'arrow-forward' } as const;

function sentimentColor(sentiment: StatsBlock['items'][number]['sentiment'], theme: Theme) {
  if (sentiment === 'positive') return accentText(theme);
  if (sentiment === 'negative') return isDark(theme) ? colors.error[400] : colors.error[700];
  return theme.textSecondary;
}

function Sparkline({ points, theme }: { points: number[]; theme: Theme }) {
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / range) * 26}`)
    .join(' ');
  return (
    <Svg width="100%" height={28} viewBox="0 0 100 30" preserveAspectRatio="none">
      <Polyline
        points={path}
        fill="none"
        stroke={toneFill('primary', theme)}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Stats({ block, theme }: { block: StatsBlock; theme: Theme }) {
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={styles.tiles}>
        {block.items.map((item, i) => (
          <View
            key={`${i}-${item.label}`}
            style={[styles.tile, { backgroundColor: theme.surface }]}
            accessible
            accessibilityLabel={`${item.label}: ${item.value}${item.change ? `, ${item.change}` : ''}`}
          >
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.label}</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{item.value}</Text>
            {item.change ? (
              <View style={styles.inline}>
                {item.trend ? (
                  <Ionicons
                    name={TREND_ICON[item.trend]}
                    size={12}
                    color={sentimentColor(item.sentiment, theme)}
                  />
                ) : null}
                <Text style={[styles.meta, { color: sentimentColor(item.sentiment, theme) }]}>
                  {item.change}
                </Text>
              </View>
            ) : null}
            {item.points ? <Sparkline points={item.points} theme={theme} /> : null}
          </View>
        ))}
      </View>
    </Frame>
  );
}

const CALLOUT_ICON = {
  info: 'information-circle',
  tip: 'bulb',
  important: 'alert-circle',
  warning: 'warning',
} as const;

function calloutColor(variant: CalloutBlock['variant'], theme: Theme): string {
  const dark = isDark(theme);
  switch (variant) {
    case 'info':
      return dark ? colors.secondary[300] : colors.secondary[700];
    case 'tip':
      return accentText(theme);
    case 'important':
      return dark ? '#E8C25A' : '#8A6A10';
    case 'warning':
      return dark ? colors.error[400] : colors.error[700];
  }
}

function Callout({ block, theme }: { block: CalloutBlock; theme: Theme }) {
  const color = calloutColor(block.variant, theme);
  const label = block.title ?? calloutLabel(block.variant);
  return (
    <View
      style={[styles.outer, styles.callout, { borderColor: color, backgroundColor: theme.surface }]}
      accessible
      accessibilityLabel={`${label}: ${block.text}`}
    >
      <Ionicons name={CALLOUT_ICON[block.variant]} size={18} color={color} />
      <View style={styles.flex}>
        <Text style={[styles.label, { color: theme.text, fontWeight: '600' }]}>{label}</Text>
        <Text style={[styles.body, { color: theme.text }]}>{block.text}</Text>
      </View>
    </View>
  );
}

function Timeline({ block, theme }: { block: TimelineBlock; theme: Theme }) {
  const dot = toneFill('primary', theme);
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={[styles.timeline, { borderColor: theme.border }]}>
        {block.items.map((item, i) => (
          <View key={`${i}-${item.date}`} style={styles.timelineItem}>
            <View style={[styles.dot, { backgroundColor: dot, borderColor: theme.background }]} />
            <Text style={[styles.meta, { color: accentText(theme), fontWeight: '600' }]}>
              {item.date}
            </Text>
            <Text style={[styles.label, { color: theme.text, fontWeight: '600' }]}>
              {item.title}
            </Text>
            {item.text ? (
              <Text style={[styles.body, { color: theme.textSecondary }]}>{item.text}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </Frame>
  );
}

function Steps({ block, theme }: { block: StepsBlock; theme: Theme }) {
  const fill = toneFill('primary', theme);
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={styles.list}>
        {block.items.map((item, i) => (
          <View key={`${i}-${item.title}`} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: fill }]}>
              <Text style={[styles.micro, { color: theme.background }]}>{i + 1}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text, fontWeight: '600' }]}>
                {item.title}
              </Text>
              {item.text ? (
                <Text style={[styles.body, { color: theme.textSecondary }]}>{item.text}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Frame>
  );
}

function Compare({ block, theme }: { block: CompareBlock; theme: Theme }) {
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={styles.list}>
        {block.columns.map((column, i) => {
          const recommended = i === block.recommended;
          const icon =
            column.tone === 'pro' ? 'checkmark' : column.tone === 'contra' ? 'close' : null;
          const iconColor =
            column.tone === 'contra'
              ? isDark(theme)
                ? colors.error[400]
                : colors.error[600]
              : toneFill('primary', theme);
          return (
            <View
              key={`${i}-${column.title}`}
              style={[
                styles.column,
                { backgroundColor: theme.surface },
                recommended && { borderColor: toneFill('primary', theme), borderWidth: 1 },
              ]}
            >
              <View style={styles.inline}>
                <Text style={[styles.label, { color: theme.text, fontWeight: '600' }]}>
                  {column.title}
                </Text>
                {recommended ? (
                  <Text
                    style={[
                      styles.badge,
                      { backgroundColor: toneFill('primary', theme), color: theme.background },
                    ]}
                  >
                    Empfehlung
                  </Text>
                ) : null}
              </View>
              {column.items.map((item, j) => (
                <View key={j} style={styles.compareItem}>
                  {icon ? (
                    <Ionicons name={icon} size={14} color={iconColor} />
                  ) : (
                    <Text style={[styles.body, { color: theme.textSecondary }]}>•</Text>
                  )}
                  <Text style={[styles.body, styles.flex, { color: theme.text }]}>{item}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </Frame>
  );
}

function Table({ block, theme }: { block: TableBlock; theme: Theme }) {
  const [first, ...rest] = block.columns;
  return (
    <Frame title={block.title} note={block.note} theme={theme}>
      <View style={styles.list}>
        {block.rows.map((row, i) => (
          <View key={i} style={[styles.column, { backgroundColor: theme.surface }]}>
            {first ? (
              <Text style={[styles.label, { color: theme.text, fontWeight: '600' }]}>
                {formatTableCell(row[first.key], first.format)}
              </Text>
            ) : null}
            {rest.map((column) => (
              <View key={column.key} style={styles.tableRow}>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>{column.label}</Text>
                <Text style={[styles.meta, { color: theme.text }]}>
                  {formatTableCell(row[column.key], column.format)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  outer: { marginVertical: spacing.xsmall },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xlarge,
    padding: spacing.small,
    gap: spacing.small,
  },
  title: { ...chatType.chatTitle, fontWeight: '600' },
  note: { ...chatType.chatMeta, marginTop: spacing.xxsmall },
  list: { gap: spacing.small },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxsmall, flexWrap: 'wrap' },
  label: { ...chatType.chatLabel },
  value: { ...chatType.chatLabel, fontVariant: ['tabular-nums'] },
  body: { ...chatType.chatSecondary },
  meta: { ...chatType.chatMeta },
  micro: { ...chatType.chatMeta, fontWeight: '700' },
  barRow: { gap: spacing.xxsmall },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.small },
  track: { height: 8, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: borderRadius.full },
  // No fade on native without an extra dependency; an open range keeps a flat
  // right edge so it reads as running off the track.
  openFill: { borderTopRightRadius: 0, borderBottomRightRadius: 0, opacity: 0.75 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: borderRadius.large,
    padding: spacing.small,
    gap: 2,
  },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  callout: {
    flexDirection: 'row',
    gap: spacing.xsmall,
    borderLeftWidth: 3,
    borderRadius: borderRadius.large,
    padding: spacing.small,
  },
  timeline: { borderLeftWidth: 1, marginLeft: 4, paddingLeft: spacing.medium, gap: spacing.small },
  timelineItem: { gap: 2 },
  dot: {
    position: 'absolute',
    left: -spacing.medium - 6,
    top: 3,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  step: { flexDirection: 'row', gap: spacing.small },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: { borderRadius: borderRadius.large, padding: spacing.small, gap: spacing.xxsmall },
  compareItem: { flexDirection: 'row', gap: spacing.xsmall, alignItems: 'flex-start' },
  badge: {
    ...chatType.chatMeta,
    fontWeight: '600',
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.small },
});
