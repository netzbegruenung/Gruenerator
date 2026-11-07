import { type MonitorArticle, type MonitorLocale } from '@gruenerator/contracts';

import { useEntityResults, useKeywordArticles, useWhatHappened } from '../hooks/useMonitor';

import { timeAgo } from '@/components/dashboard/timeAgo';

/** Eine Meldung, wie die Nachrichtenkarten sie zeigen. */
export interface BriefingNewsItem {
  key: string;
  source: string;
  time: string;
  title: string;
  href: string;
}

export interface BriefingNewsList {
  items: BriefingNewsItem[];
  pending: boolean;
}

/** Mehr zeigt keine Nachrichtenkarte, auch aufgeklappt nicht. */
export const NEWS_LIMIT = 10;

const fromMonitor = (a: MonitorArticle): BriefingNewsItem => ({
  key: a.url,
  source: a.source,
  time: timeAgo(a.publishedAt),
  title: a.title,
  href: a.url,
});

/**
 * Die drei Nachrichtenströme von /briefing — dieselben Abfragen (und Query-Keys)
 * wie /wissen, ein Wechsel zwischen beiden Seiten ist also schon geladen:
 *
 * - „Heute wichtig": die Artikel, in denen die meisten Top-Keywords zusammenkommen.
 * - „Über die Grünen": die Watcher-Treffer der letzten 24 Stunden.
 * - „Landesverbände": die neuen Beiträge der Landesverbands-Notebooks, neueste
 *   zuerst. Rein deutsch — unter `at` ist die Liste `null`, die Karte entfällt.
 */
export function useBriefingNews(locale: MonitorLocale) {
  const important = useKeywordArticles(locale);
  const greens = useEntityResults(locale === 'at' ? 'gruene-at' : 'gruene', locale);
  const lvAvailable = locale !== 'at';
  const lv = useWhatHappened(locale, { days: 7 });

  const greensArticles = greens.data?.articles ?? [];
  return {
    important: {
      items: (important.data?.articles ?? []).slice(0, NEWS_LIMIT).map(fromMonitor),
      pending: important.isPending,
    } satisfies BriefingNewsList,
    greens: {
      items: greensArticles.slice(0, NEWS_LIMIT).map(fromMonitor),
      pending: greens.isPending,
    } satisfies BriefingNewsList,
    /** Die vollen Grünen-Treffer, für den Leitsatz und die Trend-Hervorhebung. */
    greensArticles,
    greensPending: greens.isPending,
    landesverbaende: lvAvailable
      ? ({
          items: (lv.data?.days ?? [])
            .flatMap((d) => d.articles)
            .slice(0, NEWS_LIMIT)
            .map((a) => ({
              key: a.sourceUrl,
              source: a.sourceName,
              time: timeAgo(a.publishedAt ?? a.indexedAt),
              title: a.title,
              href: a.sourceUrl,
            })),
          pending: lv.isPending,
        } satisfies BriefingNewsList)
      : null,
  };
}

export type BriefingNews = ReturnType<typeof useBriefingNews>;
