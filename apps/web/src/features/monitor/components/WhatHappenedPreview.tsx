import { ArticleCard, Skeleton } from '@gruenerator/ui';
import { ChevronRight } from 'lucide-react';

import { useWhatHappened } from '../hooks/useMonitor';

import type { MonitorLocale } from '../hooks/useMonitor';

interface WhatHappenedPreviewProps {
  locale: MonitorLocale;
  /** Navigate to the full "Was ist passiert" tab. */
  onShowAll?: () => void;
}

const MAX_ARTICLES = 6;

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Compact Übersicht teaser: the latest day of content-sync Tagesbeiträge. */
export function WhatHappenedPreview({ locale, onShowAll }: WhatHappenedPreviewProps) {
  const { data, isLoading } = useWhatHappened(locale, { days: 7 });
  const day = data?.days[0];

  // Nothing synced in the window — keep the Übersicht clean instead of an empty state.
  if (!isLoading && !day) return null;

  return (
    <section className="mb-2xl">
      <div className="flex items-baseline justify-between gap-sm mb-md">
        <h2 className="text-lg font-semibold text-foreground m-0">
          Was ist passiert
          {day && (
            <span className="ml-sm text-xs font-normal text-grey-400">{formatDay(day.date)}</span>
          )}
        </h2>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors border-none bg-transparent cursor-pointer shrink-0"
          >
            Alle anzeigen
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {day ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {day.articles.slice(0, MAX_ARTICLES).map((article) => (
            <ArticleCard
              key={article.sourceUrl}
              url={article.sourceUrl}
              title={article.title}
              excerpt={article.excerpt ?? undefined}
              source={article.sourceName}
              publishedAt={article.publishedAt ?? article.indexedAt}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}
    </section>
  );
}
