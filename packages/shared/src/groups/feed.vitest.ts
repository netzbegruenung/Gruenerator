import { describe, expect, it } from 'vitest';

import { filterGroupFeed, groupFeedByKind, toGroupFeedItems } from './feed.js';

const share = (over: Record<string, unknown> = {}) => ({
  shareId: 's',
  note: null,
  pinnedAt: null,
  pinnedByName: null,
  commentCount: 0,
  ...over,
});

const content = {
  collaborative_documents: [
    {
      id: 'd1',
      title: 'Pressemitteilung',
      document_subtype: 'docs',
      shared_at: '2026-09-24T10:00:00Z',
      share: share({ shareId: 'sd1', note: 'Bitte gegenlesen', commentCount: 2 }),
    },
    {
      id: 'b1',
      title: 'Wahlkampf',
      document_subtype: 'boards',
      shared_at: '2026-09-15T10:00:00Z',
      share: share(),
    },
    {
      id: 'c1',
      title: 'Kachel',
      document_subtype: 'canvas',
      thumbnail_url: 'https://x/t.png',
      shared_at: '2026-09-19T10:00:00Z',
    },
  ],
  canvas_templates: [
    {
      id: 't1',
      title: 'Glückwunsch',
      shared_at: '2026-09-01T10:00:00Z',
      share: share({ pinnedAt: '2026-09-27T08:00:00Z', pinnedByName: 'Moritz' }),
    },
  ],
  generators: [
    {
      id: 'g1',
      name: 'klima',
      title: null,
      slug: 'klima-tipps',
      shared_at: '2026-09-11T10:00:00Z',
    },
  ],
  notebooks: [
    {
      id: 'n1',
      name: 'KommunalWiki',
      slug_suffix: 'Ab3xK9',
      shared_at: '2026-08-12T10:00:00Z',
      share: share({ pinnedAt: '2026-09-20T08:00:00Z' }),
    },
  ],
  system_notebooks: [{ id: 'bundestag', system: true, shared_at: '2026-08-01T10:00:00Z' }],
  texts: [{ id: 'x1', title: 'Rede', word_count: 420, shared_at: '2026-07-01T10:00:00Z' }],
};

describe('toGroupFeedItems', () => {
  const items = toGroupFeedItems(content as never, {
    systemNotebookTitle: (id) => (id === 'bundestag' ? 'Bundestag' : null),
  });

  it('maps every bucket to its kind and content type', () => {
    const byKey = Object.fromEntries(items.map((i) => [i.key, [i.kind, i.title]]));
    expect(byKey).toEqual({
      'collaborative_documents:d1': ['doc', 'Pressemitteilung'],
      'collaborative_documents:b1': ['board', 'Wahlkampf'],
      'collaborative_documents:c1': ['sharepic', 'Kachel'],
      'canvas_template:t1': ['sharepic-template', 'Glückwunsch'],
      'custom_generators:g1': ['generator', 'klima'],
      'notebook_collections:n1': ['notebook', 'KommunalWiki'],
      'system_notebooks:bundestag': ['notebook', 'Bundestag'],
      'user_documents:x1': ['text', 'Rede'],
    });
  });

  it('puts pinned first (latest pin on top), then newest share', () => {
    expect(items.map((i) => i.id)).toEqual(['t1', 'n1', 'd1', 'c1', 'b1', 'g1', 'bundestag', 'x1']);
  });

  it('parses share meta and drops malformed or missing meta to null', () => {
    const d1 = items.find((i) => i.id === 'd1');
    expect(d1?.share).toMatchObject({ shareId: 'sd1', note: 'Bitte gegenlesen', commentCount: 2 });
    expect(items.find((i) => i.id === 'c1')?.share).toBeNull();
    expect(items.find((i) => i.id === 'c1')?.thumbnailUrl).toBe('https://x/t.png');
    expect(items.find((i) => i.id === 'g1')?.slug).toBe('klima-tipps');
    expect(items.find((i) => i.id === 'x1')?.excerpt).toBe('420 Wörter');
  });

  it('returns an empty list for missing content', () => {
    expect(toGroupFeedItems(null)).toEqual([]);
  });

  it('groups by kind in registry order and filters by title or note', () => {
    expect(groupFeedByKind(items).map((s) => s.id)).toEqual([
      'sharepic-template',
      'sharepic',
      'doc',
      'board',
      'generator',
      'notebook',
      'text',
    ]);
    expect(filterGroupFeed(items, 'GEGENLESEN').map((i) => i.id)).toEqual(['d1']);
    expect(filterGroupFeed(items, '  ')).toHaveLength(items.length);
  });
});

describe('personInitials / formatFeedDate', () => {
  it('builds initials from first and last name part', async () => {
    const { personInitials } = await import('./feed.js');
    expect(personInitials('Moritz Wächter')).toBe('MW');
    expect(personInitials('Aileen de la Lorenz')).toBe('AL');
    expect(personInitials('  ')).toBe('?');
    expect(personInitials(null)).toBe('?');
  });

  it('formats dates in German and tolerates garbage', async () => {
    const { formatFeedDate } = await import('./feed.js');
    expect(formatFeedDate('2026-09-27T10:00:00Z')).toBe('Sonntag, 27. September');
    expect(formatFeedDate('nope')).toBe('');
    expect(formatFeedDate(null)).toBe('');
  });
});
