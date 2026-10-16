import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  getContent: vi.fn(),
  rename: vi.fn(),
  restore: vi.fn(),
}));

vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ docSnapshots: api }),
}));

const { createSnapshotVersionStorage } = await import('./snapshotVersionStorage');

const signal = new AbortController().signal;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('createSnapshotVersionStorage', () => {
  it('maps grouped snapshot rows onto BlockNote versions', async () => {
    api.list.mockResolvedValue({
      status: 200,
      body: {
        snapshots: [
          {
            id: 'a',
            version: 7,
            created_at: '2026-10-16T10:00:00.000Z',
            is_auto_save: false,
            label: 'Entwurf',
            created_by: 'u-1',
            created_by_name: 'Anna',
            snapshot_count: 1,
          },
          {
            id: 'b',
            version: 5,
            created_at: '2026-10-16T09:00:00.000Z',
            is_auto_save: true,
            label: null,
            created_by: null,
            created_by_name: null,
            snapshot_count: 3,
          },
        ],
        next_cursor: '4',
      },
    });
    const storage = createSnapshotVersionStorage('doc-1', () => true);

    expect(await storage.list(signal)).toEqual({
      ok: true,
      value: {
        snapshots: [
          {
            id: '7',
            createdAt: Date.parse('2026-10-16T10:00:00.000Z'),
            name: 'Entwurf',
            by: 'u-1',
          },
          {
            id: '5',
            createdAt: Date.parse('2026-10-16T09:00:00.000Z'),
            secondaryLabel: '3 Änderungen',
          },
        ],
        nextCursor: '4',
      },
    });
    expect(api.list).toHaveBeenCalledWith({ params: { id: 'doc-1' }, query: {} });
  });

  it('continues at the cursor and ends the history on the last page', async () => {
    api.list.mockResolvedValue({ status: 200, body: { snapshots: [], next_cursor: null } });
    const storage = createSnapshotVersionStorage('doc-1', () => true);

    expect(await storage.list(signal, '4')).toEqual({ ok: true, value: { snapshots: [] } });
    expect(api.list).toHaveBeenCalledWith({ params: { id: 'doc-1' }, query: { cursor: 4 } });
  });

  it('decodes stored content to the raw Yjs update', async () => {
    const bytes = new Uint8Array([1, 2, 250]);
    api.getContent.mockResolvedValue({
      status: 200,
      body: { version: 5, update: Buffer.from(bytes).toString('base64') },
    });
    const storage = createSnapshotVersionStorage('doc-1', () => true);

    expect(await storage.getContent('5', signal)).toEqual({ ok: true, value: bytes });
    expect(api.getContent).toHaveBeenCalledWith({ params: { id: 'doc-1', version: 5 } });
  });

  it('restores on the server against the live document', async () => {
    api.restore.mockResolvedValue({ status: 200, body: { success: true, new_version: 9 } });
    const storage = createSnapshotVersionStorage('doc-1', () => true);

    expect(await storage.restore!('5')).toEqual({ ok: true, value: undefined });
    expect(api.restore).toHaveBeenCalledWith({
      params: { id: 'doc-1', version: 5 },
      body: { apply: 'live' },
    });
  });

  it('offers no write actions to viewers, re-read on every access', () => {
    let canEdit = false;
    const storage = createSnapshotVersionStorage('doc-1', () => canEdit);
    expect(storage.create).toBeUndefined();
    expect(storage.restore).toBeUndefined();
    expect(storage.rename).toBeUndefined();
    expect(storage.remove).toBeUndefined();

    canEdit = true;
    expect(storage.restore).toBeTypeOf('function');
    // Deleting a snapshot can delete the base a document loads from.
    expect(storage.remove).toBeUndefined();
  });

  it('returns non-2xx answers and lost requests as typed errors, rethrows bugs', async () => {
    const storage = createSnapshotVersionStorage('doc-1', () => true);
    const cases: Array<[number, unknown]> = [
      [401, { type: 'forbidden' }],
      [403, { type: 'forbidden' }],
      [404, { type: 'not-found' }],
      [500, { type: 'server', status: 500 }],
    ];
    for (const [status, error] of cases) {
      api.restore.mockResolvedValueOnce({ status, body: { error: 'x' } });
      expect(await storage.restore!('5')).toEqual({ ok: false, error });
    }

    api.restore.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true })
    );
    expect(await storage.restore!('5')).toEqual({ ok: false, error: { type: 'network' } });

    const bug = new Error('bug');
    api.restore.mockRejectedValueOnce(bug);
    await expect(storage.restore!('5')).rejects.toBe(bug);
  });
});
