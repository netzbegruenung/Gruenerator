import {
  formatOverviewCount as fmt,
  formatOverviewDate,
  formatOverviewMonth,
  formatOverviewShare,
  overviewNewDocsDetail,
  overviewNounCase,
  overviewTermCoverage,
  overviewTermNotes,
} from '@gruenerator/shared/notebooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TOPIC_LABELS } from '../../config/topicConfig';
import { type NotebookOverview } from '../../hooks/notebook/useNotebookOverview';
import { CHAT_API_BASE_URL } from '../../services/chatApiUrl';
import { openUrl } from '../../services/share';
import { BODY_FONT, HEADING_FONT_BOLD, borderRadius, spacing } from '../../theme';
import { formatRelativeDate } from '../../utils/date';

import type { Theme } from '../../theme/colors';
import type { NotebookInstagramPost, TopicCategory } from '@gruenerator/contracts';

/**
 * Mobile port of web's `overview/OverviewSections.tsx` — the same cards, the same
 * wording (shared via `@gruenerator/shared/notebooks`), drawn from plain Views:
 * bars are Views with a proportional size, the term cloud is wrapped Text.
 */

/** Theme plus the notebook magenta every data mark is drawn in. */
export interface OverviewTone {
  theme: Theme;
  accent: string;
}

type Overview = NotebookOverview;

function Card({
  title,
  subtitle,
  footer,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: string | null;
  tone: OverviewTone;
  children: ReactNode;
}) {
  const { theme } = tone;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.cardHeader}>
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
      {footer ? (
        <Text style={[styles.cardFooter, { color: theme.textSecondary }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

function Bar({ ratio, tone, height }: { ratio: number; tone: OverviewTone; height: number }) {
  return (
    <View style={[styles.track, { height, backgroundColor: tone.theme.surface }]}>
      <View
        style={[
          styles.trackFill,
          { width: `${ratio * 100}%`, backgroundColor: tone.accent, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

// ── Kennzahlen ──────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: OverviewTone;
}) {
  const { theme } = tone;
  return (
    <View
      style={[styles.kpi, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      accessible
      accessibilityLabel={`${label}: ${value}, ${detail}`}
    >
      <Text style={[styles.kpiLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={[styles.kpiValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>{detail}</Text>
    </View>
  );
}

export function OverviewKpis({ overview, tone }: { overview: Overview; tone: OverviewTone }) {
  const { totals, contentTypes, sources } = overview;
  return (
    <View style={styles.kpiGrid}>
      <Kpi
        tone={tone}
        label="Dokumente"
        value={fmt(totals.documents)}
        detail={totals.undated > 0 ? `davon ${fmt(totals.undated)} ohne Datum` : 'alle datiert'}
      />
      <Kpi
        tone={tone}
        label="Neu in 30 Tagen"
        value={fmt(totals.last30Days)}
        detail={overviewNewDocsDetail(totals.last30Days, totals.previous30Days)}
      />
      <Kpi
        tone={tone}
        label="Zeitraum"
        value={formatOverviewDate(totals.firstPublished)}
        detail={`bis ${formatOverviewDate(totals.lastPublished)}`}
      />
      <Kpi
        tone={tone}
        label="Formate"
        value={fmt(contentTypes.length)}
        detail={
          sources.length > 1
            ? `aus ${fmt(sources.length)} Quellen`
            : (contentTypes[0]?.label ?? '–')
        }
      />
    </View>
  );
}

// ── Aktivität ───────────────────────────────────────────────────────────────

const CHART_HEIGHT = 120;

export function ActivityChart({ overview, tone }: { overview: Overview; tone: OverviewTone }) {
  const { monthly, totals } = overview;
  const { theme } = tone;
  const max = Math.max(1, ...monthly.map((m) => m.count));
  const total = monthly.reduce((sum, m) => sum + m.count, 0);
  const last = monthly.length - 1;
  const peak = monthly.reduce<(typeof monthly)[number] | null>(
    (best, m) => (best === null || m.count > best.count ? m : best),
    null
  );

  const subtitle =
    `${fmt(total)} Veröffentlichungen in den letzten 24 Monaten` +
    (totals.undated > 0 ? ` · ${fmt(totals.undated)} ohne Datum nicht enthalten` : '');
  const summary =
    peak && peak.count > 0
      ? `Veröffentlichungen pro Monat. Höchster Wert: ${formatOverviewMonth(peak.month, 'long')} mit ${fmt(peak.count)} ${peak.count === 1 ? 'Dokument' : 'Dokumenten'}${peak.topTopic ? `, meist ${TOPIC_LABELS[peak.topTopic]}` : ''}.`
      : 'Veröffentlichungen pro Monat.';

  return (
    <Card title="Aktivität" subtitle={subtitle} tone={tone}>
      <View accessible accessibilityRole="image" accessibilityLabel={summary}>
        <View style={styles.chart}>
          {monthly.map((m) => (
            <View key={m.month} style={styles.chartColumn}>
              {m.count > 0 && (
                <View
                  style={[
                    styles.chartBar,
                    { height: `${(m.count / max) * 100}%`, backgroundColor: tone.accent },
                  ]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={[styles.chartAxis, { borderTopColor: theme.cardBorder }]}>
          {monthly.map((m, i) =>
            (last - i) % 6 === 0 ? (
              <Text
                key={m.month}
                numberOfLines={1}
                style={[
                  styles.chartLabel,
                  { color: theme.textSecondary },
                  // The newest month ends flush right instead of running off the card.
                  i === last ? { right: 0 } : { left: `${(i / monthly.length) * 100}%` },
                ]}
              >
                {formatOverviewMonth(m.month)}
              </Text>
            ) : null
          )}
        </View>
      </View>
    </Card>
  );
}

// ── Themenprofil ────────────────────────────────────────────────────────────

const TREND_LABEL = { up: 'im Aufwind', down: 'rückläufig' } as const;

export function TopicProfile({
  overview,
  tone,
  onSelectTopic,
}: {
  overview: Overview;
  tone: OverviewTone;
  onSelectTopic: (topic: TopicCategory) => void;
}) {
  const { topics } = overview;
  const { theme } = tone;
  const hasBaseline = topics.some((t) => t.baselineShare !== null);
  const scale = Math.max(...topics.map((t) => Math.max(t.share, t.baselineShare ?? 0))) || 1;
  const classified = topics.reduce((sum, t) => sum + t.count, 0);
  const marker = theme.text;

  return (
    <Card
      title="Themenprofil"
      subtitle={`Hauptthema je Dokument · ${fmt(classified)} von ${fmt(overview.totals.documents)} eingeordnet`}
      footer="Antippen öffnet den Chat, gefiltert auf das Thema. „Im Aufwind“ und „rückläufig“ vergleichen die letzten 90 Tage mit den zwölf Monaten davor und erscheinen nur bei einem statistisch deutlichen Unterschied."
      tone={tone}
    >
      {hasBaseline && (
        <View style={styles.legendRow}>
          <View style={[styles.baselineLegend, { backgroundColor: marker }]} />
          <Text style={[styles.small, { color: theme.textSecondary }]}>
            Durchschnitt aller Landesverbände
          </Text>
        </View>
      )}
      <View>
        {topics.map((t) => {
          const trend = t.trend === 'up' || t.trend === 'down' ? t.trend : null;
          const baselineText =
            t.baselineShare !== null
              ? `, Durchschnitt aller Landesverbände ${formatOverviewShare(t.baselineShare)}`
              : '';
          return (
            <Pressable
              key={t.topic}
              onPress={() => onSelectTopic(t.topic)}
              accessibilityRole="button"
              accessibilityLabel={`${TOPIC_LABELS[t.topic]}: ${formatOverviewShare(t.share)}${trend ? `, ${TREND_LABEL[trend]}` : ''}${baselineText}. Im Chat nach diesem Thema filtern`}
              style={({ pressed }) => [
                styles.topicRow,
                pressed && { backgroundColor: theme.surface },
              ]}
            >
              <View style={styles.topicHead}>
                <Text style={[styles.topicName, { color: theme.text }]} numberOfLines={1}>
                  {TOPIC_LABELS[t.topic]}
                </Text>
                {trend && (
                  <View style={styles.trend}>
                    <Ionicons
                      name={trend === 'up' ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={theme.textSecondary}
                    />
                    <Text style={[styles.trendText, { color: theme.textSecondary }]}>
                      {TREND_LABEL[trend]}
                    </Text>
                  </View>
                )}
                <Text style={[styles.topicShare, { color: theme.text }]}>
                  {formatOverviewShare(t.share)}
                </Text>
              </View>
              <View style={styles.topicBar}>
                <Bar ratio={t.share / scale} tone={tone} height={10} />
                {t.baselineShare !== null && (
                  <View
                    style={[
                      styles.baselineMarker,
                      { left: `${(t.baselineShare / scale) * 100}%`, backgroundColor: marker },
                    ]}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// ── Köpfe ───────────────────────────────────────────────────────────────────

export function PeopleList({ overview, tone }: { overview: Overview; tone: OverviewTone }) {
  const { theme } = tone;
  return (
    <Card
      title="Köpfe"
      subtitle="Am häufigsten genannte Personen · Anzahl Dokumente"
      footer="Automatisch erkannt – einzelne Namen können falsch zugeordnet sein."
      tone={tone}
    >
      <View>
        {overview.persons.map((p, i) => (
          <View
            key={p.person}
            style={[
              styles.listRow,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.cardBorder,
              },
            ]}
            accessible
            accessibilityLabel={`${i + 1}. ${p.person}: ${fmt(p.count)} Dokumente${p.recentCount > 0 ? `, davon ${fmt(p.recentCount)} in den letzten 90 Tagen` : ''}`}
          >
            <Text style={[styles.rank, { color: theme.textSecondary }]}>{i + 1}</Text>
            <View style={styles.flex}>
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                {p.person}
              </Text>
              {p.recentCount > 0 && (
                <Text style={[styles.small, { color: theme.textSecondary }]}>
                  davon {fmt(p.recentCount)} in den letzten 90 Tagen
                </Text>
              )}
            </View>
            <Text style={[styles.rowCount, { color: theme.text }]}>{fmt(p.count)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ── Zuletzt ─────────────────────────────────────────────────────────────────

export function RecentDocuments({ overview, tone }: { overview: Overview; tone: OverviewTone }) {
  const { theme } = tone;
  return (
    <Card title="Zuletzt veröffentlicht" tone={tone}>
      <View>
        {overview.recent.map((doc, i) => {
          const meta = [
            doc.publishedAt ? formatRelativeDate(doc.publishedAt) : null,
            doc.contentTypeLabel,
            doc.sourceLabel,
          ]
            .filter(Boolean)
            .join(' · ');
          const url = doc.url;
          return (
            <Pressable
              key={doc.id}
              onPress={url ? () => void openUrl(url) : undefined}
              disabled={!url}
              accessibilityRole={url ? 'link' : 'text'}
              style={({ pressed }) => [
                styles.recentRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.cardBorder,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={styles.recentTitleRow}>
                <Text
                  style={[styles.rowTitle, styles.flex, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {doc.title}
                </Text>
                {url ? (
                  <Ionicons name="open-outline" size={14} color={theme.textSecondary} />
                ) : null}
              </View>
              <View style={styles.recentMeta}>
                {meta ? (
                  <Text style={[styles.small, { color: theme.textSecondary }]}>{meta}</Text>
                ) : null}
                {doc.themes.slice(0, 2).map((topic) => (
                  <Text
                    key={topic}
                    style={[styles.pill, { backgroundColor: theme.surface, color: theme.text }]}
                  >
                    {TOPIC_LABELS[topic]}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// ── Instagram ───────────────────────────────────────────────────────────────

function InstagramPostCard({ post, tone }: { post: NotebookInstagramPost; tone: OverviewTone }) {
  const { theme } = tone;
  const [imageFailed, setImageFailed] = useState(false);
  const meta = [post.publishedAt ? formatRelativeDate(post.publishedAt) : null, `@${post.account}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => void openUrl(post.url)}
      accessibilityRole="link"
      accessibilityLabel={`${post.caption} (Instagram, ${meta})`}
      style={({ pressed }) => [styles.instagramCard, pressed && { opacity: 0.6 }]}
    >
      {post.imagePath && !imageFailed ? (
        <Image
          source={{ uri: `${CHAT_API_BASE_URL}${post.imagePath}` }}
          style={[styles.instagramImage, { backgroundColor: theme.surface }]}
          contentFit="cover"
          accessible={false}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <Text style={[styles.body, { color: theme.text }]} numberOfLines={3}>
        {post.caption}
      </Text>
      <Text style={[styles.small, { color: theme.textSecondary }]}>{meta}</Text>
    </Pressable>
  );
}

export function InstagramPosts({
  posts,
  tone,
}: {
  posts: NotebookInstagramPost[];
  tone: OverviewTone;
}) {
  return (
    <Card title="Neu auf Instagram" subtitle="Die letzten Beiträge des Landesverbands" tone={tone}>
      <View style={styles.instagramGrid}>
        {posts.map((post) => (
          <InstagramPostCard key={post.id} post={post} tone={tone} />
        ))}
      </View>
    </Card>
  );
}

// ── Formate & Quellen ───────────────────────────────────────────────────────

function BarList({
  label,
  items,
  tone,
}: {
  /** Omitted when the card title already says it. */
  label: string | null;
  items: Array<{ value: string; label: string; count: number }>;
  tone: OverviewTone;
}) {
  const { theme } = tone;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <View style={styles.barList}>
      {label && (
        <Text accessibilityRole="header" style={[styles.overline, { color: theme.textSecondary }]}>
          {label.toUpperCase()}
        </Text>
      )}
      {items.map((item) => (
        <View
          key={item.value}
          style={styles.barItem}
          accessible
          accessibilityLabel={`${item.label}: ${fmt(item.count)}`}
        >
          <View style={styles.barItemHead}>
            <Text style={[styles.body, styles.flex, { color: theme.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.body, { color: theme.text }]}>{fmt(item.count)}</Text>
          </View>
          <Bar ratio={item.count / max} tone={tone} height={8} />
        </View>
      ))}
    </View>
  );
}

export function SourceMix({ overview, tone }: { overview: Overview; tone: OverviewTone }) {
  const showSources = overview.sources.length > 1;
  return (
    <Card title={showSources ? 'Formate & Quellen' : 'Formate'} tone={tone}>
      {overview.contentTypes.length > 0 && (
        <BarList label={showSources ? 'Formate' : null} items={overview.contentTypes} tone={tone} />
      )}
      {showSources && <BarList label="Quellen" items={overview.sources} tone={tone} />}
    </Card>
  );
}

// ── Begriffe ────────────────────────────────────────────────────────────────

/** Web's `WordCloud` scales 0.75–1.9 rem; the same span in points. */
const MIN_WORD_SIZE = 12;
const MAX_WORD_SIZE = 30;

function wordSize(value: number, min: number, max: number): number {
  if (max === min) return (MIN_WORD_SIZE + MAX_WORD_SIZE) / 2;
  return MIN_WORD_SIZE + ((value - min) / (max - min)) * (MAX_WORD_SIZE - MIN_WORD_SIZE);
}

function TermChips({
  icon,
  heading,
  items,
  tone,
}: {
  icon: 'location-outline' | 'trending-up';
  heading: string;
  items: Array<{ word: string; value: string; srDetail: string }>;
  tone: OverviewTone;
}) {
  const { theme } = tone;
  return (
    <View style={styles.barList}>
      <View style={styles.legendRow}>
        <Ionicons name={icon} size={12} color={theme.textSecondary} />
        <Text accessibilityRole="header" style={[styles.overline, { color: theme.textSecondary }]}>
          {heading.toUpperCase()}
        </Text>
      </View>
      <View style={styles.wrap}>
        {items.map((item) => (
          <View
            key={item.word}
            style={[styles.chip, { borderColor: theme.cardBorder }]}
            accessible
            accessibilityLabel={`${overviewNounCase(item.word)} ${item.value} ${item.srDetail}`}
          >
            <Text style={[styles.body, { color: theme.text }]}>
              {overviewNounCase(item.word)}{' '}
              <Text style={{ color: theme.textSecondary }}>{item.value}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function TermCloud({
  terms,
  documents,
  tone,
}: {
  terms: NonNullable<Overview['terms']>;
  documents: number;
  tone: OverviewTone;
}) {
  const { theme } = tone;
  const signature = terms.signature ?? [];
  const counts = terms.words.map((w) => w.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return (
    <Card
      title="Begriffe"
      subtitle={overviewTermCoverage(terms.documents, documents)}
      footer={overviewTermNotes(terms)}
      tone={tone}
    >
      {terms.words.length > 0 && (
        <View
          style={[styles.wrap, styles.cloud]}
          accessible
          accessibilityLabel={`Häufigste Schlagwörter: ${terms.words
            .map((w) => `${overviewNounCase(w.word)} (in ${fmt(w.count)} Dokumenten)`)
            .join(', ')}`}
        >
          {terms.words.map((w) => {
            const size = wordSize(w.count, min, max);
            return (
              <Text
                key={w.word}
                style={[
                  styles.cloudWord,
                  { color: theme.text, fontSize: size, lineHeight: Math.round(size * 1.25) },
                ]}
              >
                {overviewNounCase(w.word)}
              </Text>
            );
          })}
        </View>
      )}
      {signature.length > 0 && (
        <TermChips
          icon="location-outline"
          heading="Typisch hier"
          tone={tone}
          items={signature.map((w) => ({
            word: w.word,
            value: `${fmt(w.lift)}×`,
            srDetail: `so häufig wie in anderen Landesverbänden, in ${fmt(w.count)} Dokumenten`,
          }))}
        />
      )}
      {terms.rising.length > 0 && (
        <TermChips
          icon="trending-up"
          heading="Im Aufwind"
          tone={tone}
          items={terms.rising.map((w) => ({
            word: w.word,
            value: fmt(w.recentCount),
            srDetail: 'Dokumente in den letzten 90 Tagen',
          }))}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  cardHeader: { gap: spacing.xxsmall },
  cardTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 16 },
  cardSubtitle: { fontFamily: BODY_FONT, fontSize: 13, lineHeight: 18 },
  cardFooter: { fontFamily: BODY_FONT, fontSize: 12, lineHeight: 17 },
  body: { fontFamily: BODY_FONT, fontSize: 14 },
  small: { fontFamily: BODY_FONT, fontSize: 12 },
  overline: { fontFamily: BODY_FONT, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  track: { borderRadius: borderRadius.full, overflow: 'hidden' },
  trackFill: { height: '100%' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  // Two to a row: the basis only has to leave room for the gap, flexGrow
  // fills the rest. At 47% the pair plus the gap overflowed once the
  // overview got its own horizontal padding, and every card took a row.
  kpi: {
    flexBasis: '40%',
    flexGrow: 1,
    gap: 2,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  kpiLabel: { fontFamily: BODY_FONT, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  kpiValue: { fontFamily: BODY_FONT, fontSize: 22, fontWeight: '700' },
  kpiDetail: { fontFamily: BODY_FONT, fontSize: 12, lineHeight: 16 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: CHART_HEIGHT },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartAxis: { height: 18, marginTop: spacing.xxsmall, borderTopWidth: StyleSheet.hairlineWidth },
  chartLabel: { position: 'absolute', top: 3, fontFamily: BODY_FONT, fontSize: 11 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxsmall },
  baselineLegend: { width: 2, height: 12, borderRadius: 1 },
  topicRow: {
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.xxsmall,
    borderRadius: borderRadius.medium,
  },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  topicName: { flexShrink: 1, fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: { fontFamily: BODY_FONT, fontSize: 11, fontWeight: '700' },
  topicShare: { marginLeft: 'auto', fontFamily: BODY_FONT, fontSize: 14 },
  topicBar: { justifyContent: 'center' },
  baselineMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 16,
    marginLeft: -1,
    borderRadius: 1,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  rank: { width: 20, textAlign: 'right', fontFamily: BODY_FONT, fontSize: 12 },
  rowTitle: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  rowCount: { minWidth: 40, textAlign: 'right', fontFamily: BODY_FONT, fontSize: 14 },

  recentRow: { gap: spacing.xxsmall, paddingVertical: spacing.small },
  recentTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xsmall },
  recentMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xsmall },
  pill: {
    overflow: 'hidden',
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '600',
  },

  instagramGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  instagramCard: { flexBasis: '47%', flexGrow: 1, gap: spacing.xxsmall },
  instagramImage: { width: '100%', aspectRatio: 1, borderRadius: borderRadius.medium },

  barList: { gap: spacing.xsmall },
  barItem: { gap: spacing.xxsmall },
  barItemHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.small },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  cloud: { alignItems: 'baseline', columnGap: spacing.small, rowGap: spacing.xxsmall },
  cloudWord: { fontFamily: BODY_FONT, fontWeight: '700' },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
