import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { MAX_THREAD_CLOUD_FILES, NO_CLOUD_FILES, mergeThreadCloudFiles, sameThreadCloudFiles } =
  await import('./threadCloudFiles.js');
const { getThreadCloudFiles, setThreadCloudFiles } = await import('./threadPersistenceService.js');

const wolke = (path: string) => ({ shareLinkId: 'share-1', path, name: path });
const connect = (fileId: string) => ({ provider: 'google-drive', fileId, name: fileId });

describe('mergeThreadCloudFiles', () => {
  it('carries an earlier pick into a turn that picks nothing (#4112)', () => {
    const stored = { wolke: [wolke('/a.pdf')], connect: [connect('f1')] };
    expect(mergeThreadCloudFiles(stored, NO_CLOUD_FILES)).toEqual(stored);
  });

  it('puts this turn first and collapses a re-pick of the same file', () => {
    const stored = { wolke: [wolke('/a.pdf'), wolke('/b.pdf')], connect: [] };
    const picked = { wolke: [{ ...wolke('/b.pdf'), name: 'renamed' }], connect: [] };
    expect(mergeThreadCloudFiles(stored, picked).wolke).toEqual([
      { shareLinkId: 'share-1', path: '/b.pdf', name: 'renamed' },
      wolke('/a.pdf'),
    ]);
  });

  it('drops the oldest picks past the cap, per kind', () => {
    const stored = {
      wolke: Array.from({ length: MAX_THREAD_CLOUD_FILES }, (_, i) => wolke(`/old-${i}`)),
      connect: [connect('f1')],
    };
    const merged = mergeThreadCloudFiles(stored, { wolke: [wolke('/new')], connect: [] });
    expect(merged.wolke).toHaveLength(MAX_THREAD_CLOUD_FILES);
    expect(merged.wolke[0].path).toBe('/new');
    expect(merged.wolke.at(-1)?.path).toBe(`/old-${MAX_THREAD_CLOUD_FILES - 2}`);
    expect(merged.connect).toEqual([connect('f1')]);
  });
});

describe('sameThreadCloudFiles', () => {
  it('compares identity and order, not display names', () => {
    const a = { wolke: [wolke('/a')], connect: [connect('f1')] };
    expect(sameThreadCloudFiles(a, { ...a, wolke: [{ ...wolke('/a'), name: 'x' }] })).toBe(true);
    expect(sameThreadCloudFiles(a, { ...a, connect: [] })).toBe(false);
  });
});

describe('thread storage', () => {
  beforeEach(() => query.mockReset());

  it('reads only the owner’s live thread', async () => {
    query.mockResolvedValue([{ cloud_file_refs: { wolke: [wolke('/a')], connect: [] } }]);
    expect(await getThreadCloudFiles('t1', 'u1')).toEqual({ wolke: [wolke('/a')], connect: [] });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['t1', 'u1']);
  });

  it('treats an empty or malformed column as no files', async () => {
    query.mockResolvedValueOnce([{ cloud_file_refs: null }]);
    expect(await getThreadCloudFiles('t1', 'u1')).toEqual(NO_CLOUD_FILES);
    query.mockResolvedValueOnce([{ cloud_file_refs: { wolke: [{ path: 1 }] } }]);
    expect(await getThreadCloudFiles('t1', 'u1')).toEqual(NO_CLOUD_FILES);
    query.mockResolvedValueOnce([{ cloud_file_refs: '{not json' }]);
    expect(await getThreadCloudFiles('t1', 'u1')).toEqual(NO_CLOUD_FILES);
  });

  it('stores refs only, owner-scoped, and clears the column when nothing is left', async () => {
    query.mockResolvedValue([]);
    await setThreadCloudFiles('t1', 'u1', { wolke: [wolke('/a')], connect: [] });
    expect(query.mock.calls[0][1]).toEqual([
      JSON.stringify({ wolke: [wolke('/a')], connect: [] }),
      't1',
      'u1',
    ]);
    expect(query.mock.calls[0][0]).toMatch(/user_id = \$3/);

    await setThreadCloudFiles('t1', 'u1', NO_CLOUD_FILES);
    expect(query.mock.calls[1][1]).toEqual([null, 't1', 'u1']);
  });
});
