import { Skeleton, WordCloud, cn, type WordCloudItem } from '@gruenerator/ui';

import { TOPIC_CONFIG, type TopicCategory } from '../../monitor/topicConfig';
import { useNotebookStats, type TopicCount } from '../hooks/useNotebookStats';

import type { ReactNode } from 'react';

interface StatisticsSectionProps {
  collectionIds: string[];
  title?: string;
}

const cardClass = cn(
  'flex flex-col gap-xs bg-background border border-grey-200 dark:border-grey-700',
  'rounded-md px-md py-md'
);

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cardClass}>
      <span className="text-xs text-grey-500 dark:text-grey-400">{label}</span>
      <span className="text-2xl font-semibold text-foreground-heading">{value}</span>
    </div>
  );
}

function formatDateRange(range: { min: string | null; max: string | null }): string {
  if (!range.min && !range.max) return '–';
  const fmt = (iso: string | null) => {
    if (!iso) return '?';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '?';
    return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  };
  if (range.min === range.max) return fmt(range.min);
  return `${fmt(range.min)} – ${fmt(range.max)}`;
}

function TopicDistribution({ data, sampleSize }: { data: TopicCount[]; sampleSize: number }) {
  const known = data.filter(
    (d): d is { topic: TopicCategory; count: number } => d.topic in TOPIC_CONFIG
  );
  if (known.length === 0) return null;

  const max = Math.max(...known.map((d) => d.count));
  const total = known.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className={cardClass}>
      <div className="mb-sm flex items-baseline justify-between">
        <span className="text-xs text-grey-500 dark:text-grey-400">Themen</span>
        <span className="text-xs tabular-nums text-grey-500 dark:text-grey-400">
          {total} von {sampleSize} Dokumenten
        </span>
      </div>
      <ul className="flex flex-col gap-xs">
        {known.map((d) => {
          const info = TOPIC_CONFIG[d.topic];
          const Icon = info.icon;
          const pct = max > 0 ? (d.count / max) * 100 : 0;
          return (
            <li key={d.topic} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-sm text-foreground">
                <span className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', info.color)} aria-hidden="true" />
                  <span className="truncate">{info.name}</span>
                </span>
                <span className="tabular-nums text-grey-500 dark:text-grey-400">{d.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-100 dark:bg-grey-800">
                <div
                  className={cn('h-full rounded-full', info.barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-lg">
      <div className="grid gap-sm grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={cardClass}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-md" />
    </div>
  );
}

export function StatisticsSection({
  collectionIds,
  title = 'Statistiken',
}: StatisticsSectionProps) {
  const { data: stats, isLoading } = useNotebookStats({ collectionIds });

  if (collectionIds.length === 0) return null;

  const totalDocs = stats?.totalDocuments ?? 0;
  const noData = !isLoading && totalDocs === 0;
  if (noData) return null;

  const wordItems: WordCloudItem[] =
    stats?.topWords.map((w) => ({
      key: w.word,
      label: w.word,
      value: w.count,
      tooltip: (
        <>
          <p className="font-medium">{w.word}</p>
          <p className="text-xs text-grey-400">{w.count} Nennungen</p>
        </>
      ),
    })) ?? [];

  return (
    <section className="w-full">
      <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>

      {isLoading || !stats ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-lg">
          <div className="grid gap-sm grid-cols-2">
            <StatCard label="Dokumente" value={stats.totalDocuments.toLocaleString('de-DE')} />
            <StatCard label="Zeitraum" value={formatDateRange(stats.dateRange)} />
          </div>

          {stats.topicDistribution.length > 0 && (
            <TopicDistribution data={stats.topicDistribution} sampleSize={stats.topicSampleSize} />
          )}

          {wordItems.length > 0 && (
            <div className={cardClass}>
              <span className="mb-sm text-xs text-grey-500 dark:text-grey-400">
                Häufigste Begriffe
              </span>
              <WordCloud items={wordItems} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
