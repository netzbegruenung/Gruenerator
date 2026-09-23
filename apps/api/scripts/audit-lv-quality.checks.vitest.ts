import { describe, expect, it } from 'vitest';

import {
  type CensusPoint,
  type CheckContext,
  type CheckCode,
  runChecks,
} from './audit-lv-quality.checks.js';

const NOW = new Date('2026-09-23T12:00:00Z');

const CTX: CheckContext = {
  sources: {
    'berlin-lv-presse': {
      name: 'Grüne Berlin Presse',
      shortName: 'BE',
      maxAgeYears: 5,
    },
    'hamburg-lv-beschluesse': {
      name: 'Grüne Hamburg Beschlüsse',
      shortName: 'HH',
      maxAgeYears: null,
    },
  },
  notebookLandesverbaende: new Set(['BE', 'BE-F', 'HH']),
  contentTypeLabels: { presse: 'Pressemitteilung', beschluss: 'Beschluss/Resolution' },
  now: NOW,
};

let nextId = 1;
function point(overrides: Partial<CensusPoint> = {}): CensusPoint {
  return {
    id: nextId++,
    source_id: 'berlin-lv-presse',
    source_url: 'https://gruene.berlin/pressemitteilungen/foo_1',
    landesverband: 'BE',
    content_type: 'presse',
    content_type_label: 'Pressemitteilung',
    title: 'Pflegenottelefon für Berlin',
    published_at: '2025-12-10',
    chunk_index: 0,
    content_hash: 'h1',
    full_text:
      'Berlin wird älter und die Pflege muss mitwachsen. '.repeat(10) +
      'Deshalb fordern wir ein Pflegenottelefon.',
    wolke_etag: null,
    nlp_version: 3,
    ...overrides,
  };
}

function codes(points: CensusPoint[]): CheckCode[] {
  return runChecks(points, CTX)
    .findings.map((f) => f.code)
    .sort();
}

describe('runChecks — a clean document', () => {
  it('reports nothing for a well-formed HTML point', () => {
    expect(codes([point()])).toEqual([]);
  });
});

describe('title checks', () => {
  it.each<[string, CheckCode]>([
    ['', 'title_empty'],
    ['Grüne Berlin Presse - Pressemitteilung', 'title_source_fallback'],
    ['Unser Wahlprogramm - Kapitel 3: &nbsp;', 'title_html_entity'],
    ['Kapitel 3\nBerlin gestaltet Zukunft', 'title_linebreak'],
    ['Haltung ist hot', 'title_whitespace'],
    ['Haltung  ist hot', 'title_whitespace'],
    ['x'.repeat(151), 'title_too_long'],
    [
      'EXPO-Absage von Wegner: Wer regiert Berlin?: Nach dem Hin und Her und der nun erneuten Absage...',
      'title_teaser',
    ],
    [
      'Grün. Gerecht. Gemeinsam.: Berliner Grüne stellen Wahlprogramm vor: Heute haben die…',
      'title_teaser',
    ],
  ])('%j → %s', (title, code) => {
    expect(codes([point({ title })])).toContain(code);
  });

  it('does not flag a colon title without an ellipsis as teaser', () => {
    expect(codes([point({ title: 'NS-Raubkunst: Aufklären statt verschleiern!' })])).toEqual([]);
  });

  it('flags a title shared by more than 3 URLs of one source, once per URL', () => {
    const pts = [1, 2, 3, 4].map((n) =>
      point({ source_url: `https://gruene.berlin/p/${n}`, content_hash: `h${n}`, title: 'Presse' })
    );
    expect(codes(pts)).toEqual(Array(4).fill('title_repeated'));
    expect(codes(pts.slice(0, 3))).toEqual([]);
  });
});

describe('date checks', () => {
  it('separates undated HTML from undated files', () => {
    expect(codes([point({ published_at: null })])).toEqual(['date_missing_html']);
    expect(
      codes([point({ published_at: null, source_url: 'https://gruene.berlin/a.pdf' })])
    ).toEqual(['date_missing_file']);
    expect(codes([point({ published_at: null, wolke_etag: '"abc"' })])).toEqual([
      'date_missing_file',
    ]);
  });

  it('flags prose or garbage in published_at', () => {
    expect(codes([point({ published_at: 'Montag, der Erste' })])).toEqual(['date_not_iso']);
  });

  it('flags dates in the future (beyond one day)', () => {
    expect(codes([point({ published_at: '2026-10-01' })])).toEqual(['date_future']);
    expect(codes([point({ published_at: '2026-09-23T18:00:00' })])).toEqual([]);
  });

  it('flags the invented mid-June date from year-only matches, on files only', () => {
    const pdf = 'https://gruene-saar.de/wp-content/uploads/a.pdf';
    expect(codes([point({ source_url: pdf, published_at: '2023-06-15' })])).toEqual([
      'date_mid_june_guess',
    ]);
    const download =
      'https://gruene-fraktion.berlin/download/berlin-verdient-eine-starke-opposition/';
    expect(codes([point({ source_url: download, published_at: '2023-06-15' })])).toEqual([
      'date_mid_june_guess',
    ]);
    // Ein HTML-Artikel kann wirklich am 15. Juni erschienen sein.
    expect(codes([point({ published_at: '2023-06-15' })])).toEqual([]);
  });

  it('flags points older than the source age limit, but only when the source has one', () => {
    expect(codes([point({ published_at: '2019-01-01' })])).toEqual(['date_beyond_max_age']);
    expect(
      codes([
        point({
          source_id: 'hamburg-lv-beschluesse',
          landesverband: 'HH',
          published_at: '2012-01-01',
        }),
      ])
    ).toEqual([]);
  });
});

describe('content checks', () => {
  it('flags short full text', () => {
    expect(codes([point({ full_text: 'Kurz.' })])).toEqual(['content_short']);
  });

  it('flags chunk 0 without full_text', () => {
    expect(codes([point({ full_text: null })])).toEqual(['content_no_full_text']);
  });

  it('flags boilerplate at the start of the text', () => {
    const full_text = 'Menü Startseite Impressum Datenschutz ' + 'Inhalt '.repeat(80);
    expect(codes([point({ full_text })])).toEqual(['content_boilerplate_start']);
  });

  it('flags the same content hash under different URLs', () => {
    const pts = [
      point({ source_url: 'https://gruene.berlin/a', content_hash: 'same', title: 'A' }),
      point({ source_url: 'https://gruene.berlin/b', content_hash: 'same', title: 'B' }),
    ];
    expect(codes(pts)).toEqual(['content_duplicate_hash', 'content_duplicate_hash']);
  });

  it('flags chunk gaps and repeated chunk 0', () => {
    expect(codes([point(), point({ chunk_index: 2, full_text: null })])).toEqual(['chunk_gap']);
    expect(codes([point(), point()])).toEqual(['chunk_zero_repeated']);
    expect(codes([point({ chunk_index: 1, full_text: null })])).toEqual(['chunk_zero_missing']);
  });

  it('flags a repeated chunk index other than 0', () => {
    const second = point({ chunk_index: 1, full_text: null });
    expect(codes([point(), second, { ...second }])).toEqual(['chunk_repeated']);
  });

  it('flags points the NLP enrichment never reached', () => {
    expect(codes([point({ nlp_version: null })])).toEqual(['nlp_missing']);
  });
});

describe('identity checks', () => {
  it('flags tracking params, fragments and trailing-slash twins', () => {
    expect(codes([point({ source_url: 'https://gruene.berlin/a?tmstv=123' })])).toEqual([
      'url_query_or_fragment',
    ]);
    const twins = [
      point({ source_url: 'https://gruene.berlin/a', title: 'A', content_hash: 'x' }),
      point({ source_url: 'https://gruene.berlin/a/', title: 'B', content_hash: 'y' }),
    ];
    expect(codes(twins)).toEqual(['url_normalized_duplicate', 'url_normalized_duplicate']);
  });

  it('treats a Wolke share route fragment as part of the identity', () => {
    const wolke = (file: string) =>
      point({
        source_url: `https://wolke.netzbegruenung.de/s/xfFABYzM7pX83Fj#/Wahlprüfsteine aus 2021/${file}`,
        title: file,
        content_hash: file,
        wolke_etag: '"e"',
        published_at: null,
      });
    expect(codes([wolke('a.pdf'), wolke('b.pdf')])).toEqual([
      'date_missing_file',
      'date_missing_file',
    ]);
  });

  it('flags source ids missing from the config', () => {
    expect(codes([point({ source_id: 'schleswig-holstein-lv', landesverband: 'BE' })])).toEqual([
      'source_unknown',
    ]);
  });

  it('flags landesverband values no notebook filter covers', () => {
    expect(codes([point({ landesverband: 'MV-F' })])).toEqual(['landesverband_no_notebook']);
  });

  it('flags content types outside the config and mismatching labels', () => {
    expect(codes([point({ content_type: 'news', content_type_label: 'News' })])).toEqual([
      'content_type_unknown',
    ]);
    expect(codes([point({ content_type_label: 'Wahlprogramm' })])).toEqual([
      'content_type_label_mismatch',
    ]);
  });

  it('flags one URL stored under two source ids', () => {
    const pts = [
      point(),
      point({ source_id: 'hamburg-lv-beschluesse', landesverband: 'HH', content_hash: 'h2' }),
    ];
    expect(codes(pts)).toEqual(['url_in_two_sources', 'url_in_two_sources']);
  });
});

describe('aggregates', () => {
  it('counts documents, points, codes and date range per source', () => {
    const report = runChecks(
      [
        point({ published_at: '2024-01-02' }),
        point({ chunk_index: 1, full_text: null }),
        point({
          source_url: 'https://gruene.berlin/b',
          content_hash: 'h9',
          title: '',
          published_at: '2026-01-05T10:00:00',
        }),
      ],
      CTX
    );
    const s = report.sources['berlin-lv-presse'];
    expect(s.points).toBe(3);
    expect(s.documents).toBe(2);
    expect(s.codes).toEqual({ title_empty: 1 });
    expect(s.oldest).toBe('2024-01-02');
    expect(s.newest).toBe('2026-01-05T10:00:00');
    expect(s.dateFormats).toEqual({ day: 1, timestamp: 1 });
    expect(s.samples.title_empty).toEqual([{ url: 'https://gruene.berlin/b', detail: '' }]);
  });

  it('caps samples per code', () => {
    const pts = Array.from({ length: 15 }, (_, n) =>
      point({
        source_url: `https://gruene.berlin/x${n}`,
        content_hash: `c${n}`,
        title: `T${n}`,
        published_at: null,
      })
    );
    const s = runChecks(pts, CTX).sources['berlin-lv-presse'];
    expect(s.codes.date_missing_html).toBe(15);
    expect(s.samples.date_missing_html).toHaveLength(10);
  });
});
