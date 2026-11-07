import { type MonitorLocale } from '@gruenerator/contracts';
import {
  HEADLINE_COUNT,
  feedArticles,
  watcherArticles,
  wissenHeadlines,
  type DashboardArticle,
} from '@gruenerator/shared/monitor';
import { useMemo } from 'react';

import { useEntityResults, useWhatHappened } from './useMonitor';

/**
 * Schlagzeilen für den Kopf-Slider: Feed (neue Beiträge der Landesverbände) und
 * Watcher (Berichterstattung über die Grünen), abwechselnd gemischt — wie
 * `useWissenNews` im Web. Dieselben Query-Keys wie das Briefing, ein Besuch dort
 * ist also schon geladen. Der Feed ist rein deutsch: unter `at` mischt der Slider
 * nur den Watcher.
 */
export function useWissenNews(locale: MonitorLocale) {
  const feedAvailable = locale !== 'at';
  const feedQuery = useWhatHappened(locale, { days: 7 });
  const watcherQuery = useEntityResults(locale === 'at' ? 'gruene-at' : 'gruene', locale);

  const feed = useMemo<DashboardArticle[]>(
    () => (feedAvailable ? feedArticles(feedQuery.data?.days ?? null) : []),
    [feedAvailable, feedQuery.data]
  );
  const watcher = useMemo<DashboardArticle[]>(
    () => watcherArticles(watcherQuery.data?.articles ?? null),
    [watcherQuery.data]
  );

  const feedPending = feedAvailable && feedQuery.isPending;
  // Der Slider mischt erst, wenn beide Ströme da sind — sonst sortierte er sich um,
  // sobald der zweite eintrifft.
  const headlinesPending = feedPending || watcherQuery.isPending;
  const headlines = useMemo(
    () => (headlinesPending ? [] : wissenHeadlines(feed, watcher, HEADLINE_COUNT)),
    [headlinesPending, feed, watcher]
  );

  // Ein Fehler liest sich nicht als „leer“: die Daten im Cache bleiben, der Hinweis steht darunter.
  const error = (feedAvailable && feedQuery.isError) || watcherQuery.isError;
  const refetch = () => {
    if (feedAvailable) void feedQuery.refetch();
    void watcherQuery.refetch();
  };

  return { headlines, headlinesPending, error, refetch };
}
