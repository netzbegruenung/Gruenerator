import {
  type LandtagDocument,
  type MonitorArticle,
  type MonitorSnapshot,
  type WhatHappenedArticle,
  type WhatHappenedResult,
} from '@gruenerator/contracts';

import { teaser } from './teaser.js';
import { timeAgo } from './timeAgo.js';

type FeedDays = WhatHappenedResult['days'];

/** Ein Artikel aus Feed oder Watcher, auf die Felder gebracht, die das Dashboard zeigt. */
export interface DashboardArticle {
  key: string;
  title: string;
  text: string;
  /** Medium (Watcher) bzw. Absender im Landesverband (Feed), wie auf /briefing. */
  source: string;
  time: string;
  href: string;
}

export const HEADLINE_COUNT = 6;

// Je Strom so viele, dass der Slider voll wird, auch wenn der andere leer ist.
const ITEMS_PER_KIND = HEADLINE_COUNT;

/** Feed-Beiträge der Landesverbände (neueste Tage zuerst) als Dashboard-Artikel. */
export function feedArticles(days: FeedDays | null, now?: number): DashboardArticle[] {
  return (days ?? [])
    .flatMap((d) => d.articles ?? [])
    .slice(0, ITEMS_PER_KIND)
    .map((a) => ({
      key: a.sourceUrl,
      title: a.title,
      text: teaser(a.title, a.excerpt ?? ''),
      source: a.sourceName,
      time: timeAgo(a.publishedAt ?? a.indexedAt, now),
      href: a.sourceUrl,
    }));
}

/** Watcher-Treffer (Berichterstattung über die Grünen) als Dashboard-Artikel. */
export function watcherArticles(
  articles: MonitorArticle[] | null,
  now?: number
): DashboardArticle[] {
  return (articles ?? []).slice(0, ITEMS_PER_KIND).map((a) => ({
    key: a.url,
    title: a.title,
    text: teaser(a.title, a.excerpt),
    source: a.source,
    time: timeAgo(a.publishedAt, now),
    href: a.url,
  }));
}

/** Feed und Watcher abwechselnd, beginnend mit dem Feed — so mischt der Kopf-Slider beide Ströme. */
export function wissenHeadlines(
  feed: DashboardArticle[],
  watcher: DashboardArticle[],
  count: number = HEADLINE_COUNT
): DashboardArticle[] {
  const out: DashboardArticle[] = [];
  for (let i = 0; out.length < count && (i < feed.length || i < watcher.length); i++) {
    if (feed[i]) out.push(feed[i]);
    if (watcher[i] && out.length < count) out.push(watcher[i]);
  }
  return out;
}

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

/** Watcher-/Keyword-Treffer als Meldungen der Nachrichtenkarten (höchstens `NEWS_LIMIT`). */
export function monitorNewsItems(articles: MonitorArticle[], now?: number): BriefingNewsItem[] {
  return articles.slice(0, NEWS_LIMIT).map((a) => ({
    key: a.url,
    source: a.source,
    time: timeAgo(a.publishedAt, now),
    title: a.title,
    href: a.url,
  }));
}

/** Neue Beiträge der Landesverbands-Notebooks als Meldungen, neueste zuerst. */
export function landesverbandNewsItems(days: FeedDays, now?: number): BriefingNewsItem[] {
  return lvArticleNewsItems(
    days.flatMap((d) => d.articles),
    now
  );
}

/** Landesverbands-Beiträge ohne Tagesgruppen (Land-Ansicht) als Meldungen. */
export function lvArticleNewsItems(
  articles: WhatHappenedArticle[],
  now?: number
): BriefingNewsItem[] {
  return articles.slice(0, NEWS_LIMIT).map((a) => ({
    key: a.sourceUrl,
    source: a.sourceName,
    time: timeAgo(a.publishedAt ?? a.indexedAt, now),
    title: a.title,
    href: a.sourceUrl,
  }));
}

/** Landtagsdrucksachen als Meldungen: Dokumenttyp und Fraktionen stehen, wo sonst die Quelle steht. */
export function landtagNewsItems(documents: LandtagDocument[], now?: number): BriefingNewsItem[] {
  return documents.slice(0, NEWS_LIMIT).map((d) => ({
    key: d.url,
    source: d.parties.length > 0 ? `${d.docType} · ${d.parties.join(', ')}` : d.docType,
    time: timeAgo(d.publishedAt, now),
    title: d.title,
    href: d.url,
  }));
}

export function standLine(
  snapshot: Pick<MonitorSnapshot, 'createdAt' | 'totalArticles' | 'sources'>
): string {
  const time = new Date(snapshot.createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Stand ${time} · ${snapshot.totalArticles.toLocaleString('de-DE')} Artikel aus ${snapshot.sources.length} Quellen`;
}
