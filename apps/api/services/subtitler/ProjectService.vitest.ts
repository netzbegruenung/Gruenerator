import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Papierkorb lifecycle of a Reel. Trash touches nothing but `deleted_at`, so
 * the video directory stays until the purge; only the purge runs the old hard
 * delete (`fs.rm` of `<user>/<project>`), and only after its conditional DELETE
 * actually removed the row.
 */
const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
const rm = vi.fn<(target: string, opts: unknown) => Promise<void>>();
const reportBackgroundError = vi.fn();

vi.mock('fs/promises', () => ({ default: { rm, mkdir: vi.fn() } }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: vi.fn() }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));
vi.mock('./ffmpegWrapper.js', () => ({ ffmpegPath: '/usr/bin/ffmpeg' }));

const { SubtitlerProjectService } = await import('./ProjectService.js');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

/** Every statement and every `fs.rm`, in order. */
const effects: string[] = [];

function db(opts: { owner?: string | null; trashed?: boolean; deleted?: number } = {}): void {
  const owner = opts.owner === undefined ? USER : opts.owner;
  query.mockImplementation((sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    effects.push(s.split(' WHERE ')[0]);
    if (s.startsWith('SELECT user_id FROM subtitler_projects')) {
      return Promise.resolve(owner && !opts.trashed ? [{ user_id: owner }] : []);
    }
    if (s.startsWith('SELECT id, title, deleted_at, user_id')) {
      return Promise.resolve(
        owner && opts.trashed
          ? [{ id: PROJECT, title: 'Reel', deleted_at: new Date(), user_id: owner }]
          : []
      );
    }
    if (s.startsWith('DELETE FROM subtitler_projects')) {
      return Promise.resolve(
        Array.from({ length: opts.deleted ?? 0 }, () => ({ id: PROJECT, user_id: owner }))
      );
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  effects.length = 0;
  query.mockReset();
  reportBackgroundError.mockClear();
  rm.mockReset().mockImplementation((target) => {
    effects.push(`rm ${target.split('/').slice(-2).join('/')}`);
    return Promise.resolve();
  });
});

describe('Reel Papierkorb', () => {
  it('trash only sets deleted_at — no DELETE, the video stays', async () => {
    db();
    expect(await new SubtitlerProjectService().trashProject(USER, PROJECT)).toBe('ok');
    expect(effects).toEqual([
      'SELECT user_id FROM subtitler_projects',
      'UPDATE subtitler_projects SET deleted_at = now()',
    ]);
    expect(rm).not.toHaveBeenCalled();
  });

  it('trash, restore and purge-now answer the same owner check', async () => {
    const service = new SubtitlerProjectService();
    db({ owner: OTHER });
    expect(await service.trashProject(USER, PROJECT)).toBe('forbidden');

    db({ owner: OTHER, trashed: true });
    expect(await service.getTrashedProject(USER, PROJECT)).toBe('forbidden');
    expect(await service.restoreProject(USER, PROJECT)).toBe('forbidden');

    expect(await service.trashProject(USER, 'not-a-uuid')).toBe('not_found');
    expect(effects.some((e) => e.startsWith('UPDATE'))).toBe(false);
  });

  it('restore clears deleted_at', async () => {
    db({ trashed: true });
    expect(await new SubtitlerProjectService().restoreProject(USER, PROJECT)).toBe('ok');
    expect(query.mock.calls.at(-1)![0]).toContain('SET deleted_at = NULL');
  });

  it('purge deletes the trashed row conditionally, then the project directory', async () => {
    db({ deleted: 1 });
    const cutoff = new Date('2026-08-30T00:00:00Z');
    expect(await new SubtitlerProjectService().purgeProject(PROJECT, cutoff)).toBe(true);

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).toContain('deleted_at < $2');
    expect(sql).toContain('RETURNING id, user_id');
    expect(params).toEqual([PROJECT, cutoff]);
    expect(effects).toEqual(['DELETE FROM subtitler_projects', `rm ${USER}/${PROJECT}`]);
  });

  it('touches no file when the row was restored meanwhile (0 rows)', async () => {
    db({ deleted: 0 });
    expect(await new SubtitlerProjectService().purgeProject(PROJECT, null)).toBe(false);
    expect(effects).toEqual(['DELETE FROM subtitler_projects']);
    expect(rm).not.toHaveBeenCalled();
  });

  it('reports an ownerless Reel instead of silently leaving its directory', async () => {
    db({ owner: null, deleted: 1 });
    expect(await new SubtitlerProjectService().purgeProject(PROJECT, null)).toBe(true);
    expect(rm).not.toHaveBeenCalled();
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'subtitler_project', id: PROJECT })
    );
  });

  it('reports a failing file removal and never rethrows once the row is gone', async () => {
    db({ deleted: 1 });
    rm.mockRejectedValueOnce(new Error('EACCES'));
    expect(await new SubtitlerProjectService().purgeProject(PROJECT, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'subtitler_project', id: PROJECT })
    );
  });
});
