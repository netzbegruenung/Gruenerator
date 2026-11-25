import { describe, expect, it } from 'vitest';

import { greensArticles, importantArticles, landKeywords } from './landBriefing.js';

import type { MonitorArticle } from './types.js';

const article = (
  title: string,
  nouns: Array<[string, number]> = [],
  excerpt = ''
): MonitorArticle => ({
  url: `https://example.org/${encodeURIComponent(title)}`,
  title,
  excerpt,
  source: 'WDR',
  locale: 'de',
  publishedAt: '2026-11-25T12:00:00.000Z',
  topics: {},
  primaryTopic: null,
  topNouns: nouns.map(([noun, count]) => ({ noun, count })),
});

describe('landKeywords', () => {
  it('sums nouns over articles and drops the nouns naming the Land', () => {
    const keywords = landKeywords(
      [
        article('a', [
          ['haushalt', 2],
          ['nrw', 5],
        ]),
        article('b', [
          ['haushalt', 1],
          ['pflege', 1],
        ]),
      ],
      ['nrw']
    );
    expect(keywords).toEqual([
      { keyword: 'haushalt', count: 3, topic: null },
      { keyword: 'pflege', count: 1, topic: null },
    ]);
  });
});

describe('importantArticles', () => {
  const keywords = landKeywords(
    [
      article('k1', [
        ['haushalt', 9],
        ['schulden', 8],
        ['pflege', 7],
      ]),
    ],
    []
  );

  it('ranks articles by how many top keywords they hold', () => {
    const one = article('Pflege', [['pflege', 1]]);
    const two = article('Haushalt und Schulden', [
      ['haushalt', 1],
      ['schulden', 1],
    ]);
    const three = article('Haushalt, Schulden, Pflege', [
      ['haushalt', 1],
      ['schulden', 1],
      ['pflege', 1],
    ]);
    const twoMore = article('Schulden und Pflege', [
      ['schulden', 3],
      ['pflege', 2],
    ]);
    expect(importantArticles([one, two, three, twoMore], keywords).map((a) => a.title)).toEqual([
      'Haushalt, Schulden, Pflege',
      'Schulden und Pflege',
      'Haushalt und Schulden',
    ]);
  });

  it('falls back to the newest articles on a thin day', () => {
    const list = [article('A', [['pflege', 1]]), article('B')];
    expect(importantArticles(list, keywords)).toEqual(list);
  });
});

describe('greensArticles', () => {
  it('applies the watcher patterns of the Land locale to title and excerpt', () => {
    const hits = greensArticles('nordrhein-westfalen', [
      article('Grüne in NRW schicken Sönke Wortmann zur Bundesversammlung'),
      article('Schwerte: Acht Verletzte', [], 'Angriff auf das Büro der Grünen-Fraktion'),
      article('Land gibt grünes Licht für Radweg in Köln'),
      article('Wüst stellt Haushalt vor'),
    ]);
    expect(hits.map((a) => a.title)).toEqual([
      'Grüne in NRW schicken Sönke Wortmann zur Bundesversammlung',
      'Schwerte: Acht Verletzte',
    ]);
  });
});
