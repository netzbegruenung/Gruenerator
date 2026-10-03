import {
  cn,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  LoadingSection,
} from '@gruenerator/ui';
import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import {
  MONITOR_ACCENT,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_MUTED,
  MONITOR_TAG,
  MONITOR_TILE,
} from '../components/theme';
import { TopicDetail } from '../components/TopicDetail';
import { WordCloudCard } from '../components/WordCloudCard';
import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_CONFIG } from '../topicConfig';

import type { MonitorLocale, MonitorSnapshot } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

type TopicScore = MonitorSnapshot['topics'][number];
type MonitorKeywordEntry = MonitorSnapshot['keywords'][number];
type SocialTrend = MonitorSnapshot['socialTrends'][number];

const CLOUD_WORDS = 30;

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

/** Top-Keywords word cloud over the classified article corpus. */
function TopKeywords({
  keywords,
  totalArticles,
}: {
  keywords: MonitorKeywordEntry[];
  totalArticles: number;
}) {
  const keywordWords = useMemo(() => {
    const top = [...keywords].sort((a, b) => b.count - a.count).slice(0, CLOUD_WORDS);
    const max = Math.max(...top.map((k) => k.count), 1);
    return top.map((k) => ({ key: k.keyword, word: k.keyword, weight: k.count / max }));
  }, [keywords]);

  if (keywordWords.length === 0) return null;

  return (
    <WordCloudCard
      title="Top-Keywords"
      subtitle={`Top-Begriffe aus ${totalArticles.toLocaleString('de-DE')} Artikeln · Größe zeigt die Häufigkeit`}
      words={keywordWords}
    />
  );
}

/** X/Twitter trends cloud — scraped per locale (#2879), so the label names the country. */
function XTrends({ trends, locale }: { trends: SocialTrend[]; locale: MonitorLocale }) {
  const trendWords = useMemo(() => {
    const top = [...trends].sort((a, b) => a.rank - b.rank).slice(0, CLOUD_WORDS);
    const n = top.length || 1;
    return top.map((t, i) => ({
      key: `${t.rank}-${t.name}`,
      word: t.name,
      weight: (n - i) / n,
      url: t.url,
    }));
  }, [trends]);

  // trends24.in blocks the production server at times (#4070); say so instead
  // of leaving the column blank.
  if (trendWords.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <TrendingUp className="h-10 w-10 text-grey-300 dark:text-grey-600" />
        </EmptyMedia>
        <EmptyTitle>Gerade keine Trends</EmptyTitle>
        <EmptyDescription>
          Die X-Trends konnten zuletzt nicht abgerufen werden. Sie werden stündlich aktualisiert.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <WordCloudCard
      title="X/Twitter Trends"
      subtitle={`Top Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'} gerade jetzt · Größe zeigt die Platzierung`}
      words={trendWords}
    />
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
      <div className="grid gap-[18px] md:grid-cols-2">
        <TopKeywords keywords={snapshot.keywords} totalArticles={snapshot.totalArticles} />
        <XTrends trends={snapshot.socialTrends} locale={locale} />
      </div>
      <ThemenRanking
        topics={snapshot.topics}
        keywords={snapshot.keywords}
        onOpen={(topic) => navigate(withLocale(`/themen/${topic}`))}
      />
    </>
  );
}

/**
 * /themen and /themen/:topic — the NLP-classified news corpus of the last 24h
 * next to the X trends (/trends redirects here). Bluesky lives on /feed.
 */
function MonitorThemenPage() {
  const { topic } = useParams<{ topic?: string }>();
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data: snapshot, isLoading } = useMonitorSnapshot(locale);

  const topicKey: TopicCategory | null =
    topic !== undefined && topic in TOPIC_CONFIG ? (topic as TopicCategory) : null;

  if (topic !== undefined && topicKey === null) {
    return <Navigate to={withLocale('/themen')} replace />;
  }

  if (topicKey !== null) {
    return (
      <PageContainer maxWidth="lg">
        <TopicDetail
          topic={topicKey}
          locale={locale}
          onBack={() => navigate(withLocale('/themen'))}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="themen"
        title="Themen & Trends"
        right={
          snapshot && (
            <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
              Meistdiskutierte Themen und X-Trends der letzten 24 Stunden ·{' '}
              {snapshot.totalArticles.toLocaleString('de-DE')} Artikel aus {snapshot.sources.length}{' '}
              Quellen
            </p>
          )
        }
      />
      {isLoading && <LoadingSection />}
      {snapshot && <ThemenOverview snapshot={snapshot} locale={locale} />}
    </PageContainer>
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorThemenPage as MonitorThemenContent };

export default withAuthRequired(MonitorThemenPage, { title: 'Themen & Trends' });
