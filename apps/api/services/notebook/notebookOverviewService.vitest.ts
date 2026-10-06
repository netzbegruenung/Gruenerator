/**
 * Übersicht: the aggregation over head chunks is pure — these tests pin the
 * figures the page shows (month buckets, trends, persons, formats) without Qdrant.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/QdrantService/index.js', () => ({ getQdrantInstance: vi.fn() }));
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
}));

const {
  aggregateOverview,
  headFilter,
  pickInstagramPosts,
  regionTerms,
  signatureTerms,
  toHeadDoc,
  trendOf,
} = await import('./notebookOverviewService.js');

const NOW = new Date('2026-09-27T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

let nextId = 0;
function doc(payload: Record<string, unknown>) {
  return toHeadDoc(++nextId, payload);
}

describe('aggregateOverview', () => {
  it('buckets 24 calendar months by the month written in the payload', () => {
    const result = aggregateOverview(
      [
        // 00:30 local time on 1 Sept is 31 Aug in UTC — must stay in September.
        doc({ published_at: '2026-09-01T00:30:00+02:00', primary_topic: 'klima' }),
        doc({ published_at: '2026-09-10', primary_topic: 'klima' }),
        doc({ published_at: '2026-09-11', primary_topic: 'bildung' }),
        doc({ published_at: '2024-10-05', primary_topic: 'klima' }),
        doc({ published_at: '2020-01-01', primary_topic: 'klima' }),
      ],
      NOW,
      null
    );

    expect(result.monthly).toHaveLength(24);
    expect(result.monthly[0]).toEqual({ month: '2024-10', count: 1, topTopic: 'klima' });
    expect(result.monthly.at(-1)).toEqual({ month: '2026-09', count: 3, topTopic: 'klima' });
    expect(result.totals.firstPublished).toBe('2020-01-01');
  });

  it('counts undated and future-dated documents as undated, never in time figures', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(3) }),
        doc({}),
        doc({ published_at: 'kein Datum' }),
        doc({ published_at: '2031-01-01' }),
      ],
      NOW,
      null
    );

    expect(result.totals).toMatchObject({ documents: 4, undated: 3, last30Days: 1 });
    expect(result.recentIds).toHaveLength(1);
  });

  it('splits the last 30 days from the 30 before them', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(1) }),
        doc({ published_at: daysAgo(29) }),
        doc({ published_at: daysAgo(31) }),
        doc({ published_at: daysAgo(90) }),
      ],
      NOW,
      null
    );

    expect(result.totals).toMatchObject({ last30Days: 2, previous30Days: 1 });
  });

  it('keeps only full names and counts each person once per document', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(5), persons: ['Werner Graf', 'Werner Graf', 'Link'] }),
        doc({ published_at: daysAgo(200), persons: ['Werner Graf', 'Schwarz-Rot', 'Merz'] }),
      ],
      NOW,
      null
    );

    expect(result.persons).toEqual([{ person: 'Werner Graf', count: 2, recentCount: 1 }]);
  });

  it('labels formats from content_type_label and falls back to primary_category', () => {
    const result = aggregateOverview(
      [
        doc({ content_type: 'presse', content_type_label: 'Pressemitteilung' }),
        doc({ content_type: 'presse', content_type_label: 'Pressemitteilung' }),
        doc({ primary_category: 'Fachtexte' }),
        doc({ content_type: 'artikel' }),
      ],
      NOW,
      null
    );

    expect(result.contentTypes).toEqual([
      { value: 'presse', label: 'Pressemitteilung', count: 2 },
      { value: 'Fachtexte', label: 'Fachtexte', count: 1 },
      { value: 'artikel', label: 'Artikel', count: 1 },
    ]);
  });

  it('drops unknown topics and reports shares over classified documents only', () => {
    const result = aggregateOverview(
      [
        doc({ primary_topic: 'klima' }),
        doc({ primary_topic: 'klima' }),
        doc({ primary_topic: 'bildung' }),
        doc({ primary_topic: 'astrologie' }),
        doc({}),
      ],
      NOW,
      new Map([['klima', 0.25]])
    );

    expect(result.topics.map((t) => [t.topic, t.count, t.share, t.baselineShare])).toEqual([
      ['klima', 2, 2 / 3, 0.25],
      ['bildung', 1, 1 / 3, 0],
    ]);
  });

  it('marks a topic rising when its recent share clearly exceeds the prior year', () => {
    const recent = Array.from({ length: 20 }, (_, i) =>
      doc({ published_at: daysAgo(10 + i), primary_topic: i < 10 ? 'mobilitaet' : 'klima' })
    );
    const prior = Array.from({ length: 40 }, (_, i) =>
      doc({ published_at: daysAgo(120 + i), primary_topic: i < 4 ? 'mobilitaet' : 'klima' })
    );

    const result = aggregateOverview([...recent, ...prior], NOW, null);
    const trend = Object.fromEntries(result.topics.map((t) => [t.topic, t.trend]));

    expect(trend).toEqual({ mobilitaet: 'up', klima: 'down' });
  });

  it('counts keywords per document and reports how many documents carry them', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(5), keywords: ['radweg', 'radweg', 'schule'] }),
        doc({ published_at: daysAgo(40), keywords: ['radweg'] }),
        doc({ published_at: daysAgo(60) }),
      ],
      NOW,
      null
    );

    expect(result.terms?.documents).toBe(2);
    expect(result.terms?.words).toEqual([
      { word: 'radweg', count: 2 },
      { word: 'schule', count: 1 },
    ]);
  });

  it('keeps names, formats, roles and footer addresses out of the word lists', () => {
    const result = aggregateOverview(
      Array.from({ length: 4 }, (_, i) =>
        doc({
          published_at: daysAgo(5 + i),
          content_type: 'wahlpruefstein',
          content_type_label: 'Wahlprüfstein',
          persons: ['Nina Stahr'],
          keywords: [
            'miete',
            'nina',
            'stahr',
            'wahlprüfsteine',
            'landesvorsitzender',
            'kommandantenstr',
            'landtags-grün',
          ],
        })
      ),
      NOW,
      null
    );

    expect(result.terms?.words).toEqual([{ word: 'miete', count: 4 }]);
  });

  it('keeps the parliament and the Fraktion label out of the word lists', () => {
    const result = aggregateOverview(
      [
        doc({
          published_at: daysAgo(5),
          keywords: ['klimaschutz', 'bundestag', 'landtag', 'bundestagsfraktion'],
        }),
      ],
      NOW,
      null
    );

    expect(result.terms?.words).toEqual([{ word: 'klimaschutz', count: 1 }]);
  });

  it('leaves MdB profile pages out of the keyword statistics', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(5), primary_category: 'Fachtexte', keywords: ['ukraine'] }),
        doc({
          published_at: daysAgo(6),
          primary_category: 'Abgeordnete',
          keywords: ['mitglied', 'ausschuss', 'funktion'],
        }),
      ],
      NOW,
      null
    );

    expect(result.terms?.documents).toBe(1);
    expect(result.terms?.words).toEqual([{ word: 'ukraine', count: 1 }]);
  });

  it('has no terms before the enrichment tagged any document', () => {
    expect(aggregateOverview([doc({ published_at: daysAgo(5) })], NOW, null).terms).toBeNull();
  });

  it('lists a keyword as rising only with a clear and non-trivial recent jump', () => {
    const recent = Array.from({ length: 20 }, (_, i) =>
      doc({
        published_at: daysAgo(10 + i),
        keywords: ['landtag', ...(i < 8 ? ['wasserstoff'] : []), ...(i < 3 ? ['deich'] : [])],
      })
    );
    const prior = Array.from({ length: 40 }, (_, i) =>
      doc({
        published_at: daysAgo(120 + i),
        keywords: ['landtag', ...(i < 2 ? ['wasserstoff'] : [])],
      })
    );

    const { terms } = aggregateOverview([...recent, ...prior], NOW, null);

    // `deich` is significant by the z-test but seen in three documents only.
    expect(terms?.rising).toEqual([{ word: 'wasserstoff', count: 10, recentCount: 8 }]);
  });
});

describe('signatureTerms', () => {
  const tagged = (count: number, sourceType: string, keywords: (i: number) => string[]) =>
    Array.from({ length: count }, (_, i) =>
      doc({ source_type: sourceType, keywords: keywords(i) })
    );
  const none = new Set<string>();

  it('lists a word the notebook uses far more often than the other LVs', () => {
    const target = tagged(40, 'landesverband', (i) => [
      'partei',
      ...(i < 12 ? ['braunkohle'] : []),
    ]);
    const others = tagged(400, 'landesverband', (i) => [
      'partei',
      ...(i < 4 ? ['braunkohle'] : []),
    ]);

    const [hit, ...rest] = signatureTerms(target, { lvDocs: [...target, ...others], region: none });

    expect(rest).toEqual([]);
    // Expected 40 × (4 + 0.5) / 401 ≈ 0.45 documents, observed 12.
    expect(hit).toEqual({ word: 'braunkohle', count: 12, lift: 26.7 });
  });

  it('does not call a word typical that only the Fraktion share makes look frequent', () => {
    // "landtag" is common in every Fraktion and rare in party texts. The target is
    // all Fraktion, the reference mostly party texts — raw shares would differ 5×.
    const target = tagged(50, 'fraktion', (i) => (i < 25 ? ['landtag'] : ['antrag']));
    const others = [
      ...tagged(100, 'fraktion', (i) => (i < 50 ? ['landtag'] : ['antrag'])),
      ...tagged(400, 'landesverband', (i) => (i < 20 ? ['landtag'] : ['partei'])),
    ];

    expect(signatureTerms(target, { lvDocs: [...target, ...others], region: none })).toEqual([]);
  });

  it('needs five documents, however extreme the ratio', () => {
    const target = tagged(40, 'landesverband', (i) => ['partei', ...(i < 4 ? ['deich'] : [])]);
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(signatureTerms(target, { lvDocs: [...target, ...others], region: none })).toEqual([]);
  });

  it('leaves the notebook own documents out of the reference', () => {
    // Without subtracting them the reference would contain the 12 target hits and
    // the expected share would roughly quadruple.
    const target = tagged(40, 'landesverband', (i) => ['partei', ...(i < 12 ? ['ostsee'] : [])]);
    const others = tagged(400, 'landesverband', (i) => ['partei', ...(i < 4 ? ['ostsee'] : [])]);

    const [hit] = signatureTerms(target, { lvDocs: [...target, ...others], region: none });

    expect(hit?.lift).toBe(26.7);
  });

  it('skips the region name with its derived forms and the party own label', () => {
    const target = tagged(40, 'landesverband', () => [
      'berlin',
      'berliner*innen',
      'landtags-grün',
      'saargrüne',
      'partei',
    ]);
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(
      signatureTerms(target, {
        lvDocs: [...target, ...others],
        region: regionTerms('Grüne Berlin'),
      })
    ).toEqual([]);
  });

  it('skips scraped markup', () => {
    const target = tagged(40, 'landesverband', () => ['href="https://gruene-mv.de', 'partei']);
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(signatureTerms(target, { lvDocs: [...target, ...others], region: none })).toEqual([]);
  });

  it('drops a name fragment but keeps the same word where it is a plain noun', () => {
    // "bohm" is lemmatised out of "Ann-Sophie Bohm"; "fischer" is the trade here,
    // only one of its documents names a Fischer.
    const target = Array.from({ length: 40 }, (_, i) =>
      doc({
        source_type: 'landesverband',
        keywords: [
          'partei',
          ...(i < 10 ? ['bohm'] : []),
          ...(i >= 20 && i < 30 ? ['fischer'] : []),
        ],
        persons: [...(i < 10 ? ['Ann-Sophie Bohm'] : []), ...(i === 20 ? ['Joschka Fischer'] : [])],
      })
    );
    const others = tagged(400, 'landesverband', () => ['partei']);

    const words = signatureTerms(target, { lvDocs: [...target, ...others], region: none }).map(
      (t) => t.word
    );

    expect(words).toEqual(['fischer']);
  });

  it('recognises a known name in a signature block the NER did not tag', () => {
    // The NER names "Philmon Ghirmai" twice; in the footer of the other 10
    // documents both parts stand among the keywords, and that is a name too.
    const target = Array.from({ length: 40 }, (_, i) =>
      doc({
        source_type: 'landesverband',
        keywords: ['partei', ...(i < 12 ? ['philmon', 'ghirmai'] : [])],
        persons: i < 2 ? ['Philmon Ghirmai'] : [],
      })
    );
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(signatureTerms(target, { lvDocs: [...target, ...others], region: none })).toEqual([]);
  });

  it('does not treat one part of a known name as the name', () => {
    // The NER span carries the role word; "minister" alone is still a word.
    const target = Array.from({ length: 40 }, (_, i) =>
      doc({
        source_type: 'landesverband',
        keywords: ['partei', ...(i < 12 ? ['minister'] : [])],
        persons: i >= 30 && i < 33 ? ['Chaos-Minister Mansoori'] : [],
      })
    );
    const others = tagged(400, 'landesverband', () => ['partei']);

    const words = signatureTerms(target, { lvDocs: [...target, ...others], region: none }).map(
      (t) => t.word
    );

    expect(words).toEqual(['minister']);
  });

  it('matches a name to its lemmatised keyword', () => {
    // "Stephanie Erben" comes out of the lemmatiser as "stephanie", "erbe".
    const target = Array.from({ length: 40 }, (_, i) =>
      doc({
        source_type: 'landesverband',
        keywords: ['partei', ...(i < 12 ? ['stephanie', 'erbe'] : [])],
        persons: i < 7 ? ['Stephanie Erben'] : [],
      })
    );
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(signatureTerms(target, { lvDocs: [...target, ...others], region: none })).toEqual([]);
  });

  it('skips a shortened region name', () => {
    const target = tagged(40, 'landesverband', () => ['saar', 'bayer', 'partei']);
    const others = tagged(400, 'landesverband', () => ['partei']);

    expect(
      signatureTerms(target, {
        lvDocs: [...target, ...others],
        region: new Set([...regionTerms('Grüne Saarland'), ...regionTerms('Grüne Bayern')]),
      })
    ).toEqual([]);
  });

  it('is null outside LV notebooks and set inside them', () => {
    const docs = [doc({ published_at: daysAgo(5), keywords: ['radweg'] })];

    expect(aggregateOverview(docs, NOW, null).terms?.signature).toBeNull();
    expect(
      aggregateOverview(docs, NOW, null, { lvDocs: docs, region: none }).terms?.signature
    ).toEqual([]);
  });
});

describe('regionTerms', () => {
  it('splits hyphenated state names and drops the party prefix', () => {
    expect(regionTerms('Grüne Mecklenburg-Vorpommern')).toEqual(
      new Set(['mecklenburg-vorpommern', 'mecklenburg', 'vorpommern'])
    );
  });
});

describe('trendOf', () => {
  it('refuses to call a trend on thin windows', () => {
    expect(trendOf(10, 14, 5, 100)).toBeNull();
    expect(trendOf(10, 20, 5, 29)).toBeNull();
  });

  it('calls small moves flat', () => {
    expect(trendOf(11, 100, 10, 100)).toBe('flat');
  });
});

describe('Instagram posts', () => {
  const excludesInstagram = { key: 'content_type', match: { value: 'instagram' } };

  it('keeps them out of the statistics of a Landesverband and of the LV baseline', () => {
    expect(headFilter('berlin-system')).toMatchObject({ must_not: [excludesInstagram] });
    expect(headFilter(null)).toMatchObject({ must_not: [excludesInstagram] });
  });

  it('leaves collections outside the LV corpus unfiltered', () => {
    expect(headFilter('kommunalwiki-system')).not.toHaveProperty('must_not');
  });

  it('returns the six newest, dropping points without link or caption', () => {
    const points = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      payload: {
        source_url: `https://www.instagram.com/p/${i}/`,
        full_text: `Beitrag ${i}`,
        published_at: `2026-09-${String(10 + i).padStart(2, '0')}T08:00:00.000Z`,
        image_path: i === 7 ? null : `/lv-social/images/${i}.webp`,
        source_account: 'gruene_berlin',
      },
    }));
    points.push({
      id: 99,
      payload: { full_text: 'ohne Link', published_at: '2026-10-01' },
    } as never);

    const posts = pickInstagramPosts(points);

    expect(posts.map((p) => p.id)).toEqual(['7', '6', '5', '4', '3', '2']);
    expect(posts[0]).toEqual({
      id: '7',
      url: 'https://www.instagram.com/p/7/',
      caption: 'Beitrag 7',
      publishedAt: '2026-09-17T08:00:00.000Z',
      imagePath: null,
      account: 'gruene_berlin',
    });
  });

  it('shortens long captions', () => {
    const [post] = pickInstagramPosts([
      { id: 1, payload: { source_url: 'https://x', full_text: 'a'.repeat(400) } },
    ]);
    expect(post?.caption).toHaveLength(280);
    expect(post?.caption.endsWith('…')).toBe(true);
  });
});
