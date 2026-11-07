import { type MonitorLocale } from '@gruenerator/contracts';
import {
  HEADLINE_COUNT,
  type DashboardArticle,
  feedArticles,
  watcherArticles,
  wissenHeadlines,
} from '@gruenerator/shared/monitor';
import { useMemo } from 'react';

import { useEntityResults, useWhatHappened } from '../../monitor/hooks/useMonitor';

/** Ein Artikel aus Feed oder Watcher, auf die Felder gebracht, die das Dashboard zeigt. */
export type WissenArticle = DashboardArticle;

/**
 * Schlagzeilen für den Kopf-Slider: Feed (neue Beiträge der Landesverbände) und
 * Watcher (Berichterstattung über die Grünen), abwechselnd gemischt. Dieselben
 * Query-Keys wie /briefing, ein Besuch dort ist also schon geladen. Der Feed ist
 * rein deutsch: unter `at` mischt der Slider nur den Watcher.
 */
export function useWissenNews(locale: MonitorLocale) {
  const feedAvailable = locale !== 'at';
  const feedQuery = useWhatHappened(locale, { days: 7 });
  const watcherQuery = useEntityResults(locale === 'at' ? 'gruene-at' : 'gruene', locale);

  const feed = useMemo<WissenArticle[]>(
    () => (feedAvailable ? feedArticles(feedQuery.data?.days ?? null) : []),
    [feedAvailable, feedQuery.data]
  );

  const watcher = useMemo<WissenArticle[]>(
    () => watcherArticles(watcherQuery.data?.articles ?? null),
    [watcherQuery.data]
  );

  const feedPending = feedAvailable && feedQuery.isPending;
  const watcherPending = watcherQuery.isPending;
  // Der Slider mischt erst, wenn beide Ströme da sind — sonst sortierte er sich
  // um, sobald der zweite eintrifft.
  const headlinesPending = feedPending || watcherPending;
  const headlines = useMemo(
    () => (headlinesPending ? [] : wissenHeadlines(feed, watcher, HEADLINE_COUNT)),
    [headlinesPending, feed, watcher]
  );

  return { headlines, headlinesPending };
}
