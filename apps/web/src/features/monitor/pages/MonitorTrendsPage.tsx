import { cn, LoadingSection } from '@gruenerator/ui';
import { useMemo } from 'react';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import {
  MONITOR_ACCENT,
  MONITOR_CARD,
  MONITOR_FAINT,
  MONITOR_HEADING,
  MONITOR_MUTED,
  MONITOR_TAG,
} from '../components/theme';
import { WordCloudCard } from '../components/WordCloudCard';
import { formatDateTime } from '../formatDateTime';
import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

import type { MonitorSnapshot } from '../hooks/useMonitor';

type SocialTrend = MonitorSnapshot['socialTrends'][number];

/** How many trends the cloud shows — the page is full-width, so more fit than
 * in the two-column layout this block used to live in on /themen. */
const CLOUD_TRENDS = 30;
/** Runners-up shown as chips next to the top trend. */
const HERO_RUNNERS_UP = 5;

/** The #1 trend as a hero, mirroring the Hot-Topic hero on /themen. */
function TopTrendHero({ trends, createdAt }: { trends: SocialTrend[]; createdAt: string | null }) {
  const sorted = useMemo(() => [...trends].sort((a, b) => a.rank - b.rank), [trends]);
  const top = sorted[0];
  if (!top) return null;

  const runnersUp = sorted.slice(1, 1 + HERO_RUNNERS_UP);
  const stand = formatDateTime(createdAt);

  return (
    <div className={cn('mb-10 p-8', MONITOR_CARD)}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#b4442f] dark:text-[#e08a76]">
          Top-Trend
        </span>
        {stand && <span className={cn('text-[12px]', MONITOR_FAINT)}>Stand {stand}</span>}
      </div>

      <h2
        className={cn(
          'm-0 text-[1.9rem] font-semibold leading-[1.2] tracking-[-0.02em]',
          MONITOR_HEADING
        )}
      >
        <a
          href={top.url}
          target="_blank"
          rel="noopener noreferrer"
          className="no-underline hover:underline"
        >
          {top.name}
        </a>
      </h2>

      {runnersUp.length > 0 && (
        <div className="mt-[18px] border-t border-[#eef2ef] pt-[18px] dark:border-grey-700/60">
          <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#52907a] dark:text-[#7fae9c]">
            Ebenfalls im Trend
          </p>
          <div className="flex flex-wrap gap-2">
            {runnersUp.map((t) => (
              <a
                key={`${t.rank}-${t.name}`}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('no-underline hover:underline', MONITOR_TAG)}
              >
                <span className={cn('mr-1.5 tabular-nums', MONITOR_ACCENT)}>{t.rank}</span>
                {t.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendsOverview({ snapshot }: { snapshot: MonitorSnapshot }) {
  const trendWords = useMemo(() => {
    const top = [...snapshot.socialTrends].sort((a, b) => a.rank - b.rank).slice(0, CLOUD_TRENDS);
    const n = top.length || 1;
    return top.map((t, i) => ({
      key: `${t.rank}-${t.name}`,
      word: t.name,
      weight: (n - i) / n,
      url: t.url,
    }));
  }, [snapshot.socialTrends]);

  return (
    <>
      <TopTrendHero trends={snapshot.socialTrends} createdAt={snapshot.createdAt} />
      {trendWords.length > 0 && (
        <WordCloudCard
          title="X/Twitter Trends"
          subtitle={`Top Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'} gerade jetzt · Größe zeigt die Platzierung`}
          words={trendWords}
        />
      )}
    </>
  );
}

/**
 * /trends — what is trending on X right now. Split off from /themen, which
 * covers the NLP-classified news corpus; the Bluesky posts sit on /feed
 * alongside the Landesverband articles.
 */
function MonitorTrendsPage() {
  const { locale } = useMonitorLocaleParam();
  const { data: snapshot, isLoading } = useMonitorSnapshot(locale);

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="trends"
        title="Trends"
        right={
          <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
            Was gerade auf X im Trend liegt
            {snapshot && snapshot.socialTrends.length > 0
              ? ` · ${snapshot.socialTrends.length} Trends`
              : ''}
          </p>
        }
      />
      {isLoading && <LoadingSection />}
      {snapshot && <TrendsOverview snapshot={snapshot} />}
    </PageContainer>
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorTrendsPage as MonitorTrendsContent };

export default withAuthRequired(MonitorTrendsPage, { title: 'Trends' });
