import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPostgresInstance: () => ({ query }),
}));

const { listMediathek } = await import('./mediathekQueries.js');

const mediaRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  share_token: `tok-${id}`,
  media_type: 'image',
  title: `Bild ${id}`,
  thumbnail_path: 'thumb.webp',
  file_size: 1000,
  mime_type: 'image/png',
  duration: null,
  image_type: 'freeform',
  image_metadata: null,
  status: 'draft',
  download_count: 0,
  view_count: 0,
  created_at: new Date('2026-10-01T10:00:00Z'),
  alt_text: null,
  upload_source: 'canvas-editor',
  original_filename: null,
  content_origin: 'sharepic',
  ...extra,
});

/** Answers the page query, then each hydration query by the table it reads. */
function respond(page: Array<{ kind: string; id: string }>, rows: Record<string, unknown[]>) {
  query.mockImplementation((sql) => {
    if (sql.includes('WITH entries')) {
      return Promise.resolve(page.map((p) => ({ ...p, total: String(page.length + 3) })));
    }
    if (sql.includes('FROM shared_media')) return Promise.resolve(rows.media ?? []);
    if (sql.includes('FROM subtitler_projects')) return Promise.resolve(rows.video ?? []);
    if (sql.includes('FROM collaborative_documents')) return Promise.resolve(rows.canvas ?? []);
    return Promise.resolve([]);
  });
}

const pageSql = () => query.mock.calls.find(([sql]) => sql.includes('WITH entries'))![0];

beforeEach(() => {
  query.mockReset();
});

describe('listMediathek', () => {
  it('keeps the page order across kinds and includes autosaved drafts', async () => {
    respond(
      [
        { kind: 'video', id: 'r1' },
        { kind: 'media', id: 'm1' },
        { kind: 'canvas', id: 'c1' },
      ],
      {
        media: [mediaRow('m1')],
        video: [
          {
            id: 'r1',
            title: 'Reel',
            thumbnail_path: null,
            video_metadata: null,
            sort_date: new Date(),
          },
        ],
        canvas: [
          {
            id: 'c1',
            title: 'Plakat',
            updated_at: new Date(),
            thumbnail_url: null,
            creator_name: null,
            access_type: 'owner',
          },
        ],
      }
    );

    const result = await listMediathek('u1', { limit: '3' });

    expect(result.items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      'video:r1',
      'media:m1',
      'canvas:c1',
    ]);
    expect(result.items[1]).toMatchObject({ kind: 'media', status: 'draft', shareToken: 'tok-m1' });
    expect(result).toMatchObject({ total: 6, hasMore: true });
    expect(pageSql()).toContain(`status IN ('ready', 'draft')`);
  });

  it('drops a row that is gone by the second read instead of failing', async () => {
    respond(
      [
        { kind: 'media', id: 'm1' },
        { kind: 'media', id: 'gone' },
      ],
      { media: [mediaRow('m1')] }
    );

    const result = await listMediathek('u1', {});

    expect(result.items.map((i) => i.id)).toEqual(['m1']);
  });

  it.each([
    ['sharepic', `kind = 'canvas'`],
    ['ki', `origin = 'ki'`],
    ['reel', `kind = 'video'`],
    ['upload', `origin = 'upload'`],
  ] as const)('narrows ?typ=%s in SQL', async (typ, clause) => {
    respond([], {});

    await listMediathek('u1', { typ });

    expect(pageSql()).toContain(clause);
  });

  it('puts the search into the counted query, so total matches the hits', async () => {
    respond([], {});

    await listMediathek('u1', { search: 'Klima' });

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/COUNT\(\*\) OVER \(\)[\s\S]*title ILIKE \$3/);
    expect(params[2]).toBe('%Klima%');
  });
});
