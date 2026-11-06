import { type MonitorLocale } from '@gruenerator/contracts';
import { useMemo } from 'react';

import { lvName } from '../../monitor/bundeslaender';
import { useEntityResults, useWhatHappened } from '../../monitor/hooks/useMonitor';

import { timeAgo } from './timeAgo';

export type WissenNewsKind = 'Watcher' | 'Feed';

/** Ein Artikel aus Feed oder Watcher, auf die Felder gebracht, die das Dashboard zeigt. */
export interface WissenArticle {
  key: string;
  kind: WissenNewsKind;
  title: string;
  text: string;
  /** Medium (Watcher) bzw. Landesverband (Feed). */
  source: string;
  time: string;
  href: string;
}

const HEADLINE_COUNT = 4;
// Je Strom so viele, dass der Slider voll wird, auch wenn der andere leer ist.
const ITEMS_PER_KIND = HEADLINE_COUNT;

/** Feed und Watcher abwechselnd, beginnend mit dem Feed — so mischt der Kopf-Slider beide Ströme. */
function interleave(a: WissenArticle[], b: WissenArticle[], count: number): WissenArticle[] {
  const out: WissenArticle[] = [];
  for (let i = 0; out.length < count && (i < a.length || i < b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i] && out.length < count) out.push(b[i]);
  }
  return out;
}

/**
 * Schlagzeilen für den Kopf-Slider: Feed (neue Beiträge der Landesverbände) und
 * Watcher (Berichterstattung über die Grünen), abwechselnd gemischt. Dieselben Query-Keys wie /feed und /watcher,
 * ein Besuch dort ist also schon geladen. Der Feed ist rein deutsch: unter `at`
 * gibt es ihn nicht (`feedAvailable: false`).
 */
export function useWissenNews(locale: MonitorLocale) {
  const feedAvailable = locale !== 'at';
  const feedQuery = useWhatHappened(locale, { days: 7 });
  const watcherQuery = useEntityResults(locale === 'at' ? 'gruene-at' : 'gruene', locale);

  const feed = useMemo<WissenArticle[]>(
    () =>
      feedAvailable
        ? (feedQuery.data?.days ?? [])
            .flatMap((d) => d.articles ?? [])
            .slice(0, ITEMS_PER_KIND)
            .map((a) => ({
              key: a.sourceUrl,
              kind: 'Feed',
              title: a.title,
              text: a.excerpt ?? '',
              source: a.landesverband ? lvName(a.landesverband) : a.sourceName,
              time: timeAgo(a.publishedAt ?? a.indexedAt),
              href: a.sourceUrl,
            }))
        : [],
    [feedAvailable, feedQuery.data]
  );

  const watcher = useMemo<WissenArticle[]>(
    () =>
      (watcherQuery.data?.articles ?? []).slice(0, ITEMS_PER_KIND).map((a) => ({
        key: a.url,
        kind: 'Watcher',
        title: a.title,
        text: a.excerpt,
        source: a.source,
        time: timeAgo(a.publishedAt),
        href: a.url,
      })),
    [watcherQuery.data]
  );

  const feedPending = feedAvailable && feedQuery.isPending;
  const watcherPending = watcherQuery.isPending;
  // Der Slider mischt erst, wenn beide Ströme da sind — sonst sortierte er sich
  // um, sobald der zweite eintrifft.
  const headlinesPending = feedPending || watcherPending;
  const headlines = useMemo(
    () => (headlinesPending ? [] : interleave(feed, watcher, HEADLINE_COUNT)),
    [headlinesPending, feed, watcher]
  );

  return { headlines, headlinesPending, feedAvailable };
}
