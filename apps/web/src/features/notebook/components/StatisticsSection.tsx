import { Skeleton, cn } from '@gruenerator/ui';

import { TOPIC_CONFIG, TOPIC_COLORS, type TopicCategory } from '../../monitor/topicConfig';
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

const TOP_TERMS = 8;
const TOP_PERSONS = 6;

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
    return `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  };
  if (range.min === range.max) return fmt(range.min);
  return `${fmt(range.min)} – ${fmt(range.max)}`;
}

function TopicDistribution({ data }: { data: TopicCount[] }) {
  const known = data.filter(
    (d): d is { topic: TopicCategory; count: number } => d.topic in TOPIC_CONFIG
  );
  if (known.length === 0) return null;

  const total = known.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  return (
    <div className={cardClass}>
      <span className="mb-sm text-xs text-grey-500 dark:text-grey-400">Themenverteilung</span>

      {/* Single stacked bar, segments proportional to each topic's share. */}
      <div className="mb-md flex h-2.5 w-full overflow-hidden rounded-full bg-grey-100 dark:bg-grey-800">
        {known.map((d) => (
          <div
            key={d.topic}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(d.count / total) * 100}%`,
              backgroundColor: TOPIC_COLORS[d.topic],
            }}
            title={`${TOPIC_CONFIG[d.topic].name}: ${d.count}`}
          />
        ))}
      </div>

      {/* Legend: colored swatch + topic name + count, in a responsive grid. */}
      <ul className="grid grid-cols-3 gap-x-lg gap-y-xs max-md:grid-cols-2 max-sm:grid-cols-1">
        {known.map((d) => (
          <li
            key={d.topic}
            className="flex items-center justify-between gap-2 text-sm text-foreground"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: TOPIC_COLORS[d.topic] }}
                aria-hidden="true"
              />
              <span className="truncate">{TOPIC_CONFIG[d.topic].name}</span>
            </span>
            <span className="tabular-nums text-grey-500 dark:text-grey-400">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-xs text-grey-500 dark:text-grey-400">{label}</span>
      <p className="m-0 text-sm leading-relaxed text-foreground">
        {items.map((item, i) => (
          <span key={item}>
            {i > 0 && <span className="mx-1.5 text-grey-400">·</span>}
            {item}
          </span>
        ))}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-3 gap-sm max-sm:grid-cols-1">
        {Array.from({ length: 3 }).map((_, i) => (
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

  const classifiedCount = stats
    ? stats.topicDistribution.reduce((sum, t) => sum + t.count, 0)
    : 0;
  const terms = (stats?.topWords ?? []).slice(0, TOP_TERMS).map((w) => w.word);
  const persons = (stats?.topPersons ?? []).slice(0, TOP_PERSONS).map((p) => p.person);
  const hasFooter = terms.length > 0 || persons.length > 0;

  return (
    <section className="w-full">
      <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>

      {isLoading || !stats ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-lg">
          <div className="grid grid-cols-3 gap-sm max-sm:grid-cols-1">
            <StatCard label="Dokumente" value={stats.totalDocuments.toLocaleString('de-DE')} />
            <StatCard label="Zeitraum" value={formatDateRange(stats.dateRange)} />
            {stats.topicSampleSize > 0 && (
              <StatCard
                label="Klassifiziert"
                value={
                  <span className="tabular-nums">
                    {classifiedCount}
                    <span className="text-grey-400">/{stats.topicSampleSize}</span>
                  </span>
                }
              />
            )}
          </div>

          {stats.topicDistribution.length > 0 && (
            <TopicDistribution data={stats.topicDistribution} />
          )}

          {hasFooter && (
            <div className="grid grid-cols-2 gap-lg border-t border-grey-200 pt-lg dark:border-grey-700 max-sm:grid-cols-1">
              <TagList label="Begriffe" items={terms} />
              <TagList label="Personen" items={persons} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
