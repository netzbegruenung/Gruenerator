import { describe, expect, it, vi } from 'vitest';

import { type DocsApiClient } from '../context/DocsContext';
import { createSnapshotVersionStorage } from './snapshotVersionStorage';

function fakeClient(overrides: Partial<Record<keyof DocsApiClient, unknown>> = {}) {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn(),
    ...overrides,
  } as unknown as DocsApiClient & Record<'get' | 'post' | 'put', ReturnType<typeof vi.fn>>;
}

const signal = new AbortController().signal;

describe('createSnapshotVersionStorage', () => {
  it('maps grouped snapshot rows onto BlockNote versions', async () => {
    const client = fakeClient({
      get: vi.fn().mockResolvedValue({
        snapshots: [
          {
            version: 7,
            created_at: '2026-10-16T10:00:00.000Z',
            is_auto_save: false,
            label: 'Entwurf',
            created_by: 'u-1',
            snapshot_count: 1,
          },
          {
            version: 5,
            created_at: '2026-10-16T09:00:00.000Z',
            is_auto_save: true,
            label: null,
            created_by: null,
            snapshot_count: 3,
          },
        ],
      }),
    });
    const storage = createSnapshotVersionStorage(client, 'doc-1', () => true);

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
      },
    });
    expect(client.get).toHaveBeenCalledWith('/docs/doc-1/snapshots');
  });

  it('decodes stored content to the raw Yjs update', async () => {
    const bytes = new Uint8Array([1, 2, 250]);
    const client = fakeClient({
      get: vi.fn().mockResolvedValue({ update: Buffer.from(bytes).toString('base64') }),
    });
    const storage = createSnapshotVersionStorage(client, 'doc-1', () => true);

    const result = await storage.getContent('5', signal);
    expect(result).toEqual({ ok: true, value: bytes });
    expect(client.get).toHaveBeenCalledWith('/docs/doc-1/snapshots/5/content');
  });

  it('restores on the server against the live document', async () => {
    const client = fakeClient();
    const storage = createSnapshotVersionStorage(client, 'doc-1', () => true);

    expect(await storage.restore!('5')).toEqual({ ok: true, value: undefined });
    expect(client.post).toHaveBeenCalledWith('/docs/doc-1/snapshots/5/restore', { apply: 'live' });
  });

  it('offers no write actions to viewers, re-read on every access', () => {
    let canEdit = false;
    const storage = createSnapshotVersionStorage(fakeClient(), 'doc-1', () => canEdit);
    expect(storage.create).toBeUndefined();
    expect(storage.restore).toBeUndefined();
    expect(storage.rename).toBeUndefined();
    expect(storage.remove).toBeUndefined();

    canEdit = true;
    expect(storage.restore).toBeTypeOf('function');
    // Deleting a snapshot can delete the base a document loads from.
    expect(storage.remove).toBeUndefined();
  });

  it('returns expected API failures as typed errors and rethrows bugs', async () => {
    const withStatus = (status: number) => Object.assign(new Error('x'), { status });
    const cases: Array<[unknown, unknown]> = [
      [withStatus(403), { type: 'forbidden' }],
      [withStatus(404), { type: 'not-found' }],
      [withStatus(503), { type: 'server', status: 503 }],
      [new TypeError('Failed to fetch'), { type: 'network' }],
    ];
    for (const [thrown, error] of cases) {
      const client = fakeClient({ post: vi.fn().mockRejectedValue(thrown) });
      const storage = createSnapshotVersionStorage(client, 'doc-1', () => true);
      expect(await storage.restore!('5')).toEqual({ ok: false, error });
    }

    const bug = new Error('bug');
    const client = fakeClient({ post: vi.fn().mockRejectedValue(bug) });
    const storage = createSnapshotVersionStorage(client, 'doc-1', () => true);
    await expect(storage.restore!('5')).rejects.toBe(bug);
  });
});
