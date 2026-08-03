/**
 * Reel content search unit tests.
 *
 * The DB is mocked; what matters here is the SQL contract (user scoping, LIKE
 * escaping, uuid guard) and the snippet builder, which has to cope with BOTH
 * storage encodings of `subtitler_projects.subtitles`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([]);

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { searchReels, getReelTranscript, reelUrl } = await import('./reelSearch.js');

/** Canonical storage: JSON.stringify(SubtitleSegment[]). */
const jsonSubtitles = JSON.stringify([
  { startTime: 0, endTime: 2.5, text: 'Heute reden wir über Windkraft.' },
  { startTime: 2.5, endTime: 5, text: 'Der Ausbau geht viel zu langsam.' },
  { startTime: 5, endTime: 8, text: 'Deshalb fordern wir schnellere Verfahren.' },
  { startTime: 8, endTime: 11, text: 'Windkraft ist die günstigste Energie.' },
]);

/** Legacy storage: "MM:SS.F - MM:SS.F\nText" blocks. */
const textSubtitles = [
  '00:00.0 - 00:02.5\nHeute reden wir über Windkraft.',
  '00:02.5 - 00:05.0\nDer Ausbau geht zu langsam.',
].join('\n\n');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    title: 'Windkraft-Reel',
    status: 'exported',
    thumbnail_path: 'u/p/thumbnail.jpg',
    subtitled_video_path: 'u/p/out.mp4',
    subtitles: jsonSubtitles,
    last_edited_at: new Date('2026-07-01T10:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe('searchReels', () => {
  it('scopes to the caller and matches title OR subtitles', async () => {
    await searchReels('user-1', 'Windkraft', 5);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM subtitler_projects');
    expect(sql).toContain('WHERE user_id = $1');
    expect(sql).toContain('title ILIKE $2 OR subtitles ILIKE $2');
    expect(params).toEqual(['user-1', '%Windkraft%', 5]);
  });

  it('escapes LIKE wildcards in the query', async () => {
    await searchReels('user-1', '100%_rein', 5);
    expect(mockQuery.mock.calls[0][1][1]).toBe('%100\\%\\_rein%');
  });

  it('returns [] for a blank query without touching the DB', async () => {
    expect(await searchReels('user-1', '   ')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('quotes the matching transcript segments with timecodes', async () => {
    mockQuery.mockResolvedValue([row()]);

    const [hit] = await searchReels('user-1', 'Windkraft', 5);

    expect(hit.matchedTranscript).toBe(true);
    expect(hit.title).toBe('Windkraft-Reel');
    expect(hit.url).toBe(reelUrl('11111111-2222-3333-4444-555555555555'));
    // Only the two segments that actually say "Windkraft", each timestamped.
    expect(hit.snippet).toContain('Heute reden wir über Windkraft.');
    expect(hit.snippet).toContain('Windkraft ist die günstigste Energie.');
    expect(hit.snippet).not.toContain('Der Ausbau geht viel zu langsam.');
    expect(hit.snippet).toMatch(/^\[\d\d:\d\d\.\d–\d\d:\d\d\.\d\]/);
  });

  it('falls back to the opening segments on a title-only match', async () => {
    mockQuery.mockResolvedValue([row({ title: 'Energiepolitik' })]);

    const [hit] = await searchReels('user-1', 'Energiepolitik', 5);

    expect(hit.matchedTranscript).toBe(false);
    expect(hit.snippet).toContain('Heute reden wir über Windkraft.');
  });

  it('reads the legacy "MM:SS.F - MM:SS.F" transcript format too', async () => {
    mockQuery.mockResolvedValue([row({ subtitles: textSubtitles })]);

    const [hit] = await searchReels('user-1', 'Ausbau', 5);

    expect(hit.matchedTranscript).toBe(true);
    expect(hit.snippet).toContain('Der Ausbau geht zu langsam.');
  });

  it('survives a reel with no subtitles', async () => {
    mockQuery.mockResolvedValue([row({ subtitles: null })]);

    const [hit] = await searchReels('user-1', 'Windkraft', 5);

    expect(hit.snippet).toBe('');
    expect(hit.matchedTranscript).toBe(false);
  });

  it('degrades to [] when the query throws', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    expect(await searchReels('user-1', 'Windkraft', 5)).toEqual([]);
  });
});

describe('getReelTranscript', () => {
  it('rejects a non-UUID ref before hitting the DB', async () => {
    expect(await getReelTranscript('user-1', 'reel:abc')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the caller', async () => {
    mockQuery.mockResolvedValue([row()]);
    await getReelTranscript('user-1', '11111111-2222-3333-4444-555555555555');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND id = $2');
    expect(params).toEqual(['user-1', '11111111-2222-3333-4444-555555555555']);
  });

  it('returns the full timestamped transcript', async () => {
    mockQuery.mockResolvedValue([row()]);

    const result = await getReelTranscript('user-1', '11111111-2222-3333-4444-555555555555');

    expect(result?.title).toBe('Windkraft-Reel');
    expect(result?.segmentCount).toBe(4);
    expect(result?.transcript.split('\n')).toHaveLength(4);
    expect(result?.transcript).toContain('Deshalb fordern wir schnellere Verfahren.');
  });

  it('returns null for an unknown reel and for one without subtitles', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getReelTranscript('user-1', '11111111-2222-3333-4444-555555555555')).toBeNull();

    mockQuery.mockResolvedValue([row({ subtitles: '[]' })]);
    expect(await getReelTranscript('user-1', '11111111-2222-3333-4444-555555555555')).toBeNull();
  });
});
