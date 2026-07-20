import { cn, LoadingSection, Skeleton } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorLocaleToggle, MonitorPageHeader } from '../components/MonitorPageHeader';
import {
  MONITOR_ACCENT,
  MONITOR_BODY,
  MONITOR_CARD,
  MONITOR_CHIP,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_MUTED,
  MONITOR_TAG,
  MONITOR_TILE,
} from '../components/theme';
import { TopicDetail } from '../components/TopicDetail';
import { useBlueskyFeed } from '../hooks/useBlueskyFeed';
import {
  MONITOR_CITATION_LINK_CONFIG,
  mapMonitorCitations,
  useMonitorBriefing,
  useMonitorSnapshot,
} from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_CONFIG } from '../topicConfig';

import type { MonitorLocale, MonitorSnapshot } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

type TopicScore = MonitorSnapshot['topics'][number];
type MonitorKeywordEntry = MonitorSnapshot['keywords'][number];
type SocialTrend = MonitorSnapshot['socialTrends'][number];

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Top-ranked topic as a hero card with the AI briefing ("KI-Einordnung"). */
function HotTopicHero({ locale }: { locale: MonitorLocale }) {
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: briefing, isLoading: briefingLoading } = useMonitorBriefing(locale);
  const citations = useMemo(() => mapMonitorCitations(briefing?.citations), [briefing?.citations]);

  const hot = snapshot?.topics[0];
  const config = hot ? TOPIC_CONFIG[hot.topic] : null;
  if (!hot || !config) return null;

  const lead = hot.topArticles[0];

  return (
    <div className={cn('mb-10 p-8', MONITOR_CARD)}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#b4442f] dark:text-[#e08a76]">
          Hot Topic
        </span>
        <span className={MONITOR_CHIP}>{config.name}</span>
        {lead && (
          <span className={cn('text-[12px]', MONITOR_FAINT)}>
            {formatDateTime(lead.publishedAt)}
            {lead.publishedAt ? ' · ' : ''}
            {hot.articleCount} Artikel
          </span>
        )}
      </div>

      <h2
        className={cn(
          'm-0 text-[1.9rem] font-semibold leading-[1.2] tracking-[-0.02em]',
          MONITOR_HEADING
        )}
      >
        {lead?.title ?? config.name}
      </h2>

      {(briefing?.briefing || briefingLoading) && (
        <div className="mt-[18px] border-t border-[#eef2ef] pt-[18px] dark:border-grey-700/60">
          <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#52907a] dark:text-[#7fae9c]">
            KI-Einordnung
          </p>
          {briefing?.briefing ? (
            <>
              <CitationTextRenderer
                text={briefing.briefing}
                citations={citations}
                className={cn('text-[0.98rem] leading-[1.65]', MONITOR_BODY)}
                linkConfig={MONITOR_CITATION_LINK_CONFIG}
              />
              {citations.length > 0 && (
                <CitationSourcesDisplay
                  citations={citations}
                  linkConfig={MONITOR_CITATION_LINK_CONFIG}
                  className="mt-3"
                />
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[84%]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const INITIAL_TOPICS = 6;

/** Ranked topic tiles (count + bar + per-topic keyword pills), expandable. */
function ThemenRanking({
  topics,
  keywords,
  onOpen,
}: {
  topics: TopicScore[];
  keywords: MonitorKeywordEntry[];
  onOpen: (topic: TopicCategory) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(...topics.map((t) => t.articleCount), 1);
  const keywordsByTopic = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const k of keywords) {
      if (!k.topic) continue;
      const list = map.get(k.topic) ?? [];
      if (list.length < 3) list.push(k.keyword);
      map.set(k.topic, list);
    }
    return map;
  }, [keywords]);

  const visible = showAll ? topics : topics.slice(0, INITIAL_TOPICS);

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Themen-Ranking
        </h2>
        <span className={cn('text-[0.85rem]', MONITOR_FAINT)}>Sortiert nach Artikelanzahl</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
        {visible.map((t) => {
          const config = TOPIC_CONFIG[t.topic];
          const tags = keywordsByTopic.get(t.topic) ?? [];
          return (
            <button
              key={t.topic}
              type="button"
              onClick={() => onOpen(t.topic)}
              className={cn('flex flex-col gap-3 p-6 text-left', MONITOR_TILE)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={cn('m-0 text-[1.05rem] font-bold', MONITOR_HEADING)}>
                  {config.name}
                </h3>
                <span className={cn('text-[0.95rem] font-bold tabular-nums', MONITOR_ACCENT)}>
                  {t.articleCount}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[#eef2ef] dark:bg-grey-800">
                <div
                  className="h-full rounded bg-[#52907a]"
                  style={{ width: `${(t.articleCount / max) * 100}%` }}
                />
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((k) => (
                    <span key={k} className={MONITOR_TAG}>
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {topics.length > INITIAL_TOPICS && (
        <div className="mt-[18px] flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="cursor-pointer rounded-full border border-[#b9d0c5] bg-white px-[22px] py-2.5 text-[0.9rem] font-bold text-[#316049] transition-colors hover:bg-[#eef4f1] dark:border-grey-600 dark:bg-grey-900/40 dark:text-[#7fae9c] dark:hover:bg-grey-800/60"
          >
            {showAll ? 'Weniger anzeigen' : `Alle ${topics.length} Themen anzeigen`}
          </button>
        </div>
      )}
    </section>
  );
}

/** Size a word-cloud entry by its normalized weight (0..1). */
function cloudEntry(weight: number): { style: { fontSize: string }; className: string } {
  const tier = weight >= 0.66 ? 2 : weight >= 0.33 ? 1 : 0;
  return {
    style: { fontSize: `${(0.82 + weight * 0.6).toFixed(2)}rem` },
    className:
      tier === 2
        ? 'font-bold text-[#316049] dark:text-[#6fae90]'
        : tier === 1
          ? 'font-semibold text-[#5c6b63] dark:text-grey-300'
          : 'font-semibold text-[#8b978f] dark:text-grey-500',
  };
}

function WordCloudCard({
  title,
  subtitle,
  words,
}: {
  title: string;
  subtitle: string;
  words: { key: string; word: string; weight: number; url?: string }[];
}) {
  return (
    <div>
      <h2
        className={cn('m-0 mb-1 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}
      >
        {title}
      </h2>
      <p className={cn('m-0 mb-5 text-[0.9rem]', MONITOR_MUTED)}>{subtitle}</p>
      <div className={cn('flex flex-wrap items-baseline gap-x-3.5 gap-y-2 p-6', MONITOR_CARD)}>
        {words.map((w) => {
          const { style, className } = cloudEntry(w.weight);
          return w.url ? (
            <a
              key={w.key}
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              style={style}
              className={cn('leading-tight no-underline hover:underline', className)}
            >
              {w.word}
            </a>
          ) : (
            <span key={w.key} style={style} className={cn('leading-tight', className)}>
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function KeywordsAndTrends({
  keywords,
  trends,
  totalArticles,
}: {
  keywords: MonitorKeywordEntry[];
  trends: SocialTrend[];
  totalArticles: number;
}) {
  const keywordWords = useMemo(() => {
    const top = [...keywords].sort((a, b) => b.count - a.count).slice(0, 20);
    const max = Math.max(...top.map((k) => k.count), 1);
    return top.map((k) => ({ key: k.keyword, word: k.keyword, weight: k.count / max }));
  }, [keywords]);

  const trendWords = useMemo(() => {
    const top = [...trends].sort((a, b) => a.rank - b.rank).slice(0, 20);
    const n = top.length || 1;
    return top.map((t) => ({
      key: `${t.rank}-${t.name}`,
      word: t.name,
      weight: (n - top.indexOf(t)) / n,
      url: t.url,
    }));
  }, [trends]);

  if (keywordWords.length === 0 && trendWords.length === 0) return null;

  return (
    <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1.45fr_1fr]">
      {keywordWords.length > 0 && (
        <WordCloudCard
          title="Top-Keywords"
          subtitle={`Top-Begriffe aus ${totalArticles.toLocaleString('de-DE')} Artikeln · Größe zeigt die Häufigkeit`}
          words={keywordWords}
        />
      )}
      {trendWords.length > 0 && (
        <WordCloudCard
          title="X/Twitter Trends"
          subtitle="Top Trends in Deutschland gerade jetzt"
          words={trendWords}
        />
      )}
    </div>
  );
}

function BlueskyGrid({ locale }: { locale: MonitorLocale }) {
  const { data: posts, isLoading } = useBlueskyFeed(locale);
  if (isLoading) {
    return (
      <section className="mt-12">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className="h-40 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }
  if (!posts || posts.length === 0) return null;
  const account = posts[0]?.authorHandle;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className={cn('m-0 text-[1.35rem] font-semibold tracking-[-0.01em]', MONITOR_HEADING)}>
          Von Bluesky
        </h2>
        {account && (
          <span className={cn('text-[0.85rem] font-bold', MONITOR_ACCENT)}>@{account}</span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
        {posts.slice(0, 6).map((post) => (
          <div key={post.uri} className={cn('flex flex-col gap-3.5 p-6', MONITOR_TILE)}>
            <div className="flex flex-col gap-0.5">
              <span className={cn('text-[0.95rem] font-bold', MONITOR_HEADING)}>
                {post.authorName}
              </span>
              <span className={cn('text-[0.8rem]', MONITOR_FAINT)}>@{post.authorHandle}</span>
            </div>
            <p className={cn('m-0 flex-1 text-[0.92rem] leading-[1.6] line-clamp-5', MONITOR_BODY)}>
              {post.text}
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-[#eef2ef] pt-3 dark:border-grey-700/60">
              <span className={cn('text-[0.78rem]', MONITOR_FAINT)}>
                {formatDateTime(post.createdAt)}
              </span>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'text-[0.8rem] font-bold no-underline hover:underline',
                  MONITOR_ACCENT
                )}
              >
                Ansehen
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThemenOverview({
  snapshot,
  locale,
}: {
  snapshot: MonitorSnapshot;
  locale: MonitorLocale;
}) {
  const navigate = useNavigate();
  const { withLocale } = useMonitorLocaleParam();
  return (
    <>
      <HotTopicHero locale={locale} />
      <ThemenRanking
        topics={snapshot.topics}
        keywords={snapshot.keywords}
        onOpen={(topic) => navigate(withLocale(`/experiments/monitor/themen/${topic}`))}
      />
      <KeywordsAndTrends
        keywords={snapshot.keywords}
        trends={snapshot.socialTrends}
        totalArticles={snapshot.totalArticles}
      />
      <BlueskyGrid locale={locale} />
    </>
  );
}

/** /experiments/monitor/themen and /experiments/monitor/themen/:topic. */
function MonitorThemenPage() {
  const { topic } = useParams<{ topic?: string }>();
  const navigate = useNavigate();
  const { locale, setLocale, withLocale } = useMonitorLocaleParam();
  const { data: snapshot, isLoading } = useMonitorSnapshot(locale);

  const topicKey: TopicCategory | null =
    topic !== undefined && topic in TOPIC_CONFIG ? (topic as TopicCategory) : null;

  if (topic !== undefined && topicKey === null) {
    return <Navigate to={withLocale('/experiments/monitor/themen')} replace />;
  }

  if (topicKey !== null) {
    return (
      <PageContainer maxWidth="lg">
        <TopicDetail
          topic={topicKey}
          locale={locale}
          onBack={() => navigate(withLocale('/experiments/monitor/themen'))}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="themen"
        title="Themen"
        right={
          <div className="flex flex-col items-end gap-2">
            <MonitorLocaleToggle locale={locale} onChange={setLocale} />
            {snapshot && (
              <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
                Meistdiskutierte Themen der letzten 24 Stunden ·{' '}
                {snapshot.totalArticles.toLocaleString('de-DE')} Artikel aus{' '}
                {snapshot.sources.length} Quellen
              </p>
            )}
          </div>
        }
      />
      {isLoading && <LoadingSection />}
      {snapshot && <ThemenOverview snapshot={snapshot} locale={locale} />}
    </PageContainer>
  );
}

export default withAuthRequired(MonitorThemenPage, { title: 'Themen' });
