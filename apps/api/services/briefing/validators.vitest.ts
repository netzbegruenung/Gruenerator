import { describe, expect, it } from 'vitest';

import { buildCandidates, validateLagebildOutput } from './lagebild.js';
import { validatePersonalLines } from './personalLines.js';

import type { MonitorArticle, TopicScore } from '../monitor/types.js';

const article = (url: string, title: string, source = 'tagesschau'): MonitorArticle => ({
  url,
  title,
  source,
  publishedAt: null,
  excerpt: '',
  locale: 'de',
  topics: {},
  primaryTopic: null,
});

describe('validateLagebildOutput', () => {
  const topics: TopicScore[] = [
    {
      topic: 'klima',
      score: 0.9,
      articleCount: 3,
      topArticles: [
        article(
          'https://www.tagesschau.de/1',
          'Klimagipfel beginnt',
          'tagesschau.de - Die Nachrichten der ARD'
        ),
      ],
    },
  ];
  const candidates = buildCandidates(
    [article('https://www.spiegel.de/p', 'Grüne fordern X', 'DER SPIEGEL - Schlagzeilen')],
    topics
  );

  it('shows the original headline and the domain, whatever text the model adds', () => {
    const result = validateLagebildOutput(
      { items: [{ sourceId: 'q1', text: 'Robert Özdemir fordert alles.' }, { sourceId: 'q2' }] },
      candidates
    );
    expect(result).toEqual({
      ok: true,
      value: [
        {
          kind: 'partei',
          topic: null,
          text: 'Grüne fordern X',
          url: 'https://www.spiegel.de/p',
          source: 'spiegel.de',
        },
        {
          kind: 'welt',
          topic: 'klima',
          text: 'Klimagipfel beginnt',
          url: 'https://www.tagesschau.de/1',
          source: 'tagesschau.de',
        },
      ],
    });
  });

  it('rejects an invented source', () => {
    expect(validateLagebildOutput({ items: [{ sourceId: 'q9' }] }, candidates).ok).toBe(false);
  });

  it('keeps at most two lines per kind and skips duplicates', () => {
    const result = validateLagebildOutput(
      { items: [{ sourceId: 'q1' }, { sourceId: 'q1' }, { sourceId: 'q2' }] },
      candidates
    );
    expect(result.ok && result.value.map((i) => i.url)).toEqual([
      'https://www.spiegel.de/p',
      'https://www.tagesschau.de/1',
    ]);
  });
});

describe('validatePersonalLines', () => {
  const ctx = {
    inputText: 'Offene Aufgaben (2)\n- Antrag (bis 13. Nov.)',
    recent: [
      { ref: 'c1', title: 'Antrag Kitaplätze' },
      { ref: 'd1', title: 'Rede Haushaltsdebatte' },
    ],
    taskCount: 2,
    allowIdea: true,
  };
  const good = {
    intro: 'Zwei Aufgaben drängen heute.',
    recap: 'Du hast zuletzt am Kita-Antrag gesessen.',
    ideas: ['ein Sharepic zum Kita-Antrag bauen', 'Aktionsideen sammeln'],
  };

  it('accepts a grounded answer and infers the reference from the recap', () => {
    const result = validatePersonalLines(good, ctx);
    expect(result.ok && result.value.basedOn).toBe('c1');
    expect(result.ok && result.value.suggestions).toEqual([
      'Ein Sharepic zum Kita-Antrag bauen',
      'Aktionsideen sammeln',
    ]);
  });

  it('rejects a recap that names nothing of the own work', () => {
    expect(validatePersonalLines({ ...good, recap: 'Du warst fleißig.' }, ctx).ok).toBe(false);
  });

  it('demands recap and at least two ideas when allowed', () => {
    expect(validatePersonalLines({ intro: good.intro }, ctx).ok).toBe(false);
    expect(validatePersonalLines({ ...good, ideas: ['nur eins'] }, ctx).ok).toBe(false);
  });

  it('drops recap and ideas when too little own work exists', () => {
    const result = validatePersonalLines(good, { ...ctx, allowIdea: false });
    expect(result.ok && result.value).toMatchObject({ recap: null, ideas: [], suggestions: [] });
  });

  it('rejects an invented number', () => {
    expect(validatePersonalLines({ ...good, intro: 'Heute warten 7 Termine.' }, ctx).ok).toBe(
      false
    );
  });

  it('rejects a wrong task count in words', () => {
    expect(validatePersonalLines({ ...good, intro: 'Drei Aufgaben warten heute.' }, ctx).ok).toBe(
      false
    );
  });

  it('rejects office speak and banned phrases in any prose field', () => {
    expect(validatePersonalLines({ ...good, newsLead: 'Im Fokus steht der Gipfel:' }, ctx).ok).toBe(
      false
    );
    expect(validatePersonalLines({ ...good, intro: 'Ich hoffe, dein Tag wird gut.' }, ctx).ok).toBe(
      false
    );
  });

  it('allows a few emojis but not a flood', () => {
    expect(
      validatePersonalLines({ ...good, intro: 'Freitag 🌻 und fast geschafft.' }, ctx).ok
    ).toBe(true);
    expect(validatePersonalLines({ ...good, intro: 'Los 🌻🌻🌻🌻 geht es heute.' }, ctx).ok).toBe(
      false
    );
  });
});

describe('toPartyNewsItem', () => {
  it('maps a corpus payload and drops incomplete ones', async () => {
    const { toPartyNewsItem } = await import('./partyNews.js');
    expect(
      toPartyNewsItem(
        {
          title: ' Klimabonus ',
          source_url: 'https://gruene.at/x',
          published_at: '2026-11-05T09:00:00Z',
        },
        'gruene.at'
      )
    ).toEqual({
      title: 'Klimabonus',
      url: 'https://gruene.at/x',
      sourceName: 'gruene.at',
      day: '2026-11-05',
    });
    expect(toPartyNewsItem({ title: 'X', source_url: 'https://y' }, 'gruene.de')).toBeNull();
  });
});
