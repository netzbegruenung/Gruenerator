import { type MonitorArticle, type TopicCategory, type TopicScore } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { buildBriefingLead } from './briefingLead.js';

const topic = (t: TopicCategory, articleCount: number): TopicScore => ({
  topic: t,
  score: articleCount,
  articleCount,
  topArticles: [],
});

const article = (primaryTopic: TopicCategory | null, i = 0): MonitorArticle => ({
  url: `https://example.org/${primaryTopic ?? 'none'}/${i}`,
  title: 'Titel',
  source: 'Quelle',
  publishedAt: null,
  excerpt: '',
  locale: 'de',
  topics: {},
  primaryTopic,
});

const many = (t: TopicCategory | null, n: number) =>
  Array.from({ length: n }, (_, i) => article(t, i));

describe('buildBriefingLead', () => {
  it('names the biggest topic of the day and of the Greens coverage', () => {
    const lead = buildBriefingLead(
      [topic('sicherheit', 143), topic('europa', 413), topic('mobilitaet', 110)],
      [...many('justiz', 3), ...many('europa', 1)]
    );
    expect(lead).toEqual({ news: ['europa'], greens: ['justiz'] });
  });

  it('names two topics when the second is within ten percent of the first', () => {
    const lead = buildBriefingLead(
      [topic('europa', 100), topic('klima', 91)],
      [...many('soziales', 3), ...many('bildung', 3)]
    );
    expect(lead?.news).toEqual(['europa', 'klima']);
    expect(lead?.greens).toEqual(['soziales', 'bildung']);
  });

  it('reports a quiet day instead of generalising from one or two articles', () => {
    expect(buildBriefingLead([topic('europa', 10)], many('klima', 2))?.greens).toBe('quiet');
  });

  it('only counts the articles when no topic carries three of them', () => {
    expect(buildBriefingLead([topic('europa', 10)], many(null, 5))?.greens).toEqual({ count: 5 });
    // Der Fall vom 06.11.2026: zwei von sieben Berichten mit „Bildung".
    const day = [...many('bildung', 2), ...many('klima', 1), ...many(null, 4)];
    expect(buildBriefingLead([topic('europa', 10)], day)?.greens).toEqual({ count: 7 });
  });

  it('has no lead without topics', () => {
    expect(buildBriefingLead([], many('klima', 5))).toBeNull();
    expect(buildBriefingLead([topic('europa', 0)], [])).toBeNull();
  });
});
