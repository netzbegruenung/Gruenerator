import { type ContentItem, type ContentKind } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchers = {
  doc: vi.fn(),
  board: vi.fn(),
  image: vi.fn(),
  video: vi.fn(),
  canvas: vi.fn(),
};

vi.mock('./contentQueries.js', () => ({ FETCHERS: fetchers }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { BadContentRequest, listContent, parseKinds, parseLimit } =
  await import('./contentController.js');
const { decodeCursor } = await import('./contentCursor.js');

/** A row of the given kind, `n` minutes older than the one before it. */
function item(kind: ContentKind, n: number): ContentItem {
  const date = new Date(Date.UTC(2026, 6, 1, 12, 0, 0) - n * 60_000).toISOString();
  const base = {
    id: `${kind}-${n}`,
    title: `${kind} ${n}`,
    date,
    href: `/${kind}/${n}`,
    deleteEndpoint: `/api/${kind}/${n}`,
    creatorName: null,
    accessType: null,
  };
  switch (kind) {
    case 'doc':
      return { ...base, kind: 'doc', documentType: 'blank', emoji: '📄', content: null };
    case 'board':
      return { ...base, kind: 'board', boardType: 'kanban', preview: null };
    case 'image':
      return {
        ...base,
        kind: 'image',
        shareToken: `tok-${n}`,
        thumbnailUrl: `/api/share/tok-${n}/thumbnail`,
        blurhash: null,
        contentOrigin: 'sharepic',
      };
    case 'video':
      return { ...base, kind: 'video', thumbnailUrl: null, duration: null };
    case 'canvas':
      return { ...base, kind: 'canvas', thumbnailUrl: null };
  }
}

/** `count` rows of one kind, newest first, all newer than `offsetMinutes`. */
function rows(kind: ContentKind, count: number, offsetMinutes = 0): ContentItem[] {
  return Array.from({ length: count }, (_, i) => item(kind, offsetMinutes + i));
}

beforeEach(() => {
  for (const fetcher of Object.values(fetchers)) {
    fetcher.mockReset();
    fetcher.mockResolvedValue([]);
  }
});

describe('parseKinds', () => {
  it('defaults to all five', () => {
    expect(parseKinds(undefined)).toEqual(['doc', 'board', 'image', 'video', 'canvas']);
    expect(parseKinds('')).toEqual(['doc', 'board', 'image', 'video', 'canvas']);
  });

  it('parses a comma list and drops duplicates', () => {
    expect(parseKinds('image, video ,image')).toEqual(['image', 'video']);
  });

  it('rejects an unknown kind instead of silently ignoring it', () => {
    // Silently dropping it would answer a question the caller did not ask.
    expect(() => parseKinds('reel')).toThrow(BadContentRequest);
  });
});

describe('parseLimit', () => {
  it('defaults and caps', () => {
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit('9999')).toBe(50);
    expect(parseLimit('0')).toBe(20);
    expect(parseLimit('abc')).toBe(20);
  });
});

describe('listContent', () => {
  it('gives a filtered request its full limit, however busy the other kinds are', async () => {
    // THE regression test. `aggregateRecentActivity` fetches `limit` rows per
    // kind, merges and cuts the merged list back to `limit` — so 50 fresh docs
    // push every reel out and the Studio strip renders empty. Asking for
    // `kind=video` must return videos, and only the video query may run.
    fetchers.video.mockResolvedValue(rows('video', 21, 100));
    fetchers.doc.mockResolvedValue(rows('doc', 21, 0));

    const result = await listContent('u1', { kind: 'video', limit: '20' });

    expect(result.items).toHaveLength(20);
    expect(result.items.every((i) => i.kind === 'video')).toBe(true);
    expect(fetchers.doc).not.toHaveBeenCalled();
  });

  it('merges every kind newest first when no filter is given', async () => {
    fetchers.doc.mockResolvedValue(rows('doc', 2, 0));
    fetchers.image.mockResolvedValue(rows('image', 2, 1));

    const result = await listContent('u1', { limit: '10' });

    expect(result.items.map((i) => i.id)).toEqual(['doc-0', 'doc-1', 'image-1', 'image-2']);
    expect(result.nextCursor).toBeNull();
  });

  it('asks for one row past the page so it knows whether there is a next one', async () => {
    fetchers.video.mockResolvedValue(rows('video', 6));

    const result = await listContent('u1', { kind: 'video', limit: '5' });

    expect(fetchers.video).toHaveBeenCalledWith('u1', 6, null);
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).not.toBeNull();
  });

  it('stops paginating when the last page is short', async () => {
    fetchers.video.mockResolvedValue(rows('video', 3));

    const result = await listContent('u1', { kind: 'video', limit: '5' });

    expect(result.nextCursor).toBeNull();
  });

  it('points the cursor at the last item it actually returned', async () => {
    fetchers.video.mockResolvedValue(rows('video', 6));

    const { nextCursor } = await listContent('u1', { kind: 'video', limit: '5' });
    const decoded = decodeCursor(nextCursor!);

    expect(decoded).toMatchObject({ kind: 'video', id: 'video-4', kinds: ['video'] });
  });

  it('hands the cursor down to the fetchers on the next page', async () => {
    fetchers.video.mockResolvedValue(rows('video', 6));
    const { nextCursor } = await listContent('u1', { kind: 'video', limit: '5' });

    await listContent('u1', { kind: 'video', limit: '5', cursor: nextCursor! });

    expect(fetchers.video).toHaveBeenLastCalledWith('u1', 6, decodeCursor(nextCursor!));
  });

  it('rejects a cursor issued for a different filter', async () => {
    fetchers.video.mockResolvedValue(rows('video', 6));
    const { nextCursor } = await listContent('u1', { kind: 'video', limit: '5' });

    // Paging on with a changed filter would skip rows the new filter should
    // include and repeat rows it should not.
    await expect(
      listContent('u1', { kind: 'video,image', limit: '5', cursor: nextCursor! })
    ).rejects.toThrow(BadContentRequest);
  });

  it('rejects a malformed cursor', async () => {
    await expect(listContent('u1', { cursor: 'kaputt!!' })).rejects.toThrow(BadContentRequest);
  });

  it('names a failing kind instead of returning it as empty', async () => {
    // The whole point of `degraded`: a broken query used to be indistinguishable
    // from an empty account, so the surface showed "du hast nichts" either way.
    fetchers.doc.mockResolvedValue(rows('doc', 2));
    fetchers.image.mockRejectedValue(new Error('JOIN kaputt'));

    const result = await listContent('u1', { kind: 'doc,image', limit: '10' });

    expect(result.degraded).toEqual(['image']);
    expect(result.items.map((i) => i.id)).toEqual(['doc-0', 'doc-1']);
  });

  it('keeps serving the other four kinds when one is down', async () => {
    fetchers.doc.mockRejectedValue(new Error('kaputt'));
    fetchers.video.mockResolvedValue(rows('video', 1));

    const result = await listContent('u1', { limit: '10' });

    expect(result.degraded).toEqual(['doc']);
    expect(result.items).toHaveLength(1);
  });
});
