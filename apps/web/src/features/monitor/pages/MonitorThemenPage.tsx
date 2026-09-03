import { cn, LoadingSection, Skeleton } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import {
  CitationModal,
  CitationSourcesDisplay,
  CitationTextRenderer,
} from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
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
import { WordCloudCard } from '../components/WordCloudCard';
import { formatDateTime } from '../formatDateTime';
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

/** Top-Keywords word cloud over the classified article corpus. */
function TopKeywords({
  keywords,
  totalArticles,
}: {
  keywords: MonitorKeywordEntry[];
  totalArticles: number;
}) {
  const keywordWords = useMemo(() => {
    const top = [...keywords].sort((a, b) => b.count - a.count).slice(0, 30);
    const max = Math.max(...top.map((k) => k.count), 1);
    return top.map((k) => ({ key: k.keyword, word: k.keyword, weight: k.count / max }));
  }, [keywords]);

  if (keywordWords.length === 0) return null;

  return (
    <div className="mt-12">
      <WordCloudCard
        title="Top-Keywords"
        subtitle={`Top-Begriffe aus ${totalArticles.toLocaleString('de-DE')} Artikeln · Größe zeigt die Häufigkeit`}
        words={keywordWords}
      />
    </div>
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
        onOpen={(topic) => navigate(withLocale(`/themen/${topic}`))}
      />
      <TopKeywords keywords={snapshot.keywords} totalArticles={snapshot.totalArticles} />
    </>
  );
}

/**
 * /themen and /themen/:topic — the NLP-classified news corpus of the last 24h.
 * The social pulse (X trends, Bluesky) lives on /trends.
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
      <CitationModal />
      <MonitorPageHeader
        current="themen"
        title="Themen"
        right={
          snapshot && (
            <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
              Meistdiskutierte Themen der letzten 24 Stunden ·{' '}
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

export default withAuthRequired(MonitorThemenPage, { title: 'Themen' });
