import {
  type MonitorArticle,
  type MonitorSnapshot,
  type WhatHappenedResult,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  type DashboardArticle,
  HEADLINE_COUNT,
  NEWS_LIMIT,
  feedArticles,
  landesverbandNewsItems,
  monitorNewsItems,
  standLine,
  watcherArticles,
  wissenHeadlines,
} from './news.js';
import { teaser } from './teaser.js';

const a = (key: string): DashboardArticle => ({
  key,
  title: key,
  text: '',
  source: '',
  time: '',
  href: key,
});

const monitorArticle = (i: number): MonitorArticle => ({
  url: `https://x.test/${i}`,
  title: `Titel ${i}`,
  source: 'Quelle',
  publishedAt: '2026-11-07T08:00:00Z',
  excerpt: `Ein Auszug ${i}. Und noch ein Satz.`,
  locale: 'de',
  topics: {},
  primaryTopic: null,
});

const feedDay = (n: number): WhatHappenedResult['days'] => [
  {
    date: '2026-11-07',
    counts: { stored: n, updated: 0 },
    articles: Array.from({ length: n }, (_, i) => ({
      sourceUrl: `https://lv.test/${i}`,
      sourceName: 'LV',
      title: `Beitrag ${i}`,
      excerpt: `Auszug ${i}. Weiter.`,
      publishedAt: '2026-11-07T08:00:00Z',
      indexedAt: '2026-11-07T09:00:00Z',
    })),
  } as unknown as WhatHappenedResult['days'][number],
];

describe('wissenHeadlines', () => {
  it('interleaves feed and watcher, feed first, capped at count', () => {
    const f = [a('f1'), a('f2')];
    const w = [a('w1'), a('w2'), a('w3')];
    expect(wissenHeadlines(f, w, 4).map((x) => x.key)).toEqual(['f1', 'w1', 'f2', 'w2']);
  });

  it('fills from one stream when the other is empty', () => {
    expect(wissenHeadlines([], [a('w1'), a('w2')]).map((x) => x.key)).toEqual(['w1', 'w2']);
    expect(wissenHeadlines([], [])).toEqual([]);
  });
});

describe('feedArticles / watcherArticles', () => {
  const now = Date.parse('2026-11-07T10:00:00Z');

  it('takes at most HEADLINE_COUNT per stream and teasers the text', () => {
    const feed = feedArticles(feedDay(8), now);
    expect(feed).toHaveLength(HEADLINE_COUNT);
    expect(feed[0].text).toBe(teaser('Beitrag 0', 'Auszug 0. Weiter.'));

    const watcher = watcherArticles(
      Array.from({ length: 8 }, (_, i) => monitorArticle(i)),
      now
    );
    expect(watcher).toHaveLength(HEADLINE_COUNT);
    expect(watcher[0].text).toBe(teaser('Titel 0', 'Ein Auszug 0. Und noch ein Satz.'));
  });

  it('returns an empty list without data', () => {
    expect(feedArticles(null)).toEqual([]);
    expect(watcherArticles(null)).toEqual([]);
  });
});

describe('briefing news', () => {
  it('caps briefing lists at NEWS_LIMIT', () => {
    const items = monitorNewsItems(Array.from({ length: 12 }, (_, i) => monitorArticle(i)));
    expect(items).toHaveLength(NEWS_LIMIT);
    expect(landesverbandNewsItems(feedDay(12))).toHaveLength(NEWS_LIMIT);
  });
});

describe('standLine', () => {
  it('formats the stand line', () => {
    const snapshot = {
      createdAt: '2026-11-07T08:05:00Z',
      totalArticles: 1234,
      sources: ['a', 'b'],
    } as unknown as MonitorSnapshot;
    expect(standLine(snapshot)).toMatch(/^Stand \d\d:\d\d · 1\.234 Artikel aus 2 Quellen$/);
  });
});
