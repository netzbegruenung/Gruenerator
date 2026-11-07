import { type MonitorLocale } from '@gruenerator/contracts';
import {
  type BriefingNewsList,
  landesverbandNewsItems,
  monitorNewsItems,
} from '@gruenerator/shared/monitor';

import { useEntityResults, useKeywordArticles, useWhatHappened } from '../hooks/useMonitor';

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
      items: monitorNewsItems(important.data?.articles ?? []),
      pending: important.isPending,
    } satisfies BriefingNewsList,
    greens: {
      items: monitorNewsItems(greensArticles),
      pending: greens.isPending,
    } satisfies BriefingNewsList,
    /** Die vollen Grünen-Treffer, für den Leitsatz und die Trend-Hervorhebung. */
    greensArticles,
    greensPending: greens.isPending,
    landesverbaende: lvAvailable
      ? ({
          items: landesverbandNewsItems(lv.data?.days ?? []),
          pending: lv.isPending,
        } satisfies BriefingNewsList)
      : null,
  };
}

export type BriefingNews = ReturnType<typeof useBriefingNews>;
