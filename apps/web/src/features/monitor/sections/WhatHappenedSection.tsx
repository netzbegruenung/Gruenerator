import { ArticleCard, SectionHeader, Skeleton } from '@gruenerator/ui';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useWhatHappened } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

const MAX_ARTICLES = 6;

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Latest day of content-sync Tagesbeiträge, linking into /monitor/feed. */
export function WhatHappenedSection() {
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data, isLoading } = useWhatHappened(locale, { days: 7 });
  const day = data?.days[0];

  // Nothing synced in the window — keep the feed home clean instead of an empty state.
  if (!isLoading && !day) return null;

  return (
    <section className="mb-2xl">
      <SectionHeader
        title="Was ist passiert"
        onTitleClick={() => navigate(withLocale('/monitor/feed'))}
        actions={
          <span className="inline-flex items-center gap-sm">
            {day && <span className="text-xs text-grey-400">{formatDay(day.date)}</span>}
            <Link
              to={withLocale('/monitor/feed')}
              className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
            >
              Alle anzeigen
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        }
      />

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
