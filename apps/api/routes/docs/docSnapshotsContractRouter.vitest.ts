/**
 * docSnapshotsContractRouter — the guarantees a restore must keep:
 *  - only people Hocuspocus lets edit may restore (the write goes around its auth);
 *  - the current content is saved BEFORE anything is applied;
 *  - no live state, no restore — a restore without a backup is the data loss
 *    #4624 was about;
 *  - old tabs (no `apply`) get the backup and nothing applied server-side.
 */
import { gzipSync } from 'zlib';

import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, readLiveState, applyToLive, checkDocumentAccess, checkDocumentWriteAccess } =
  vi.hoisted(() => ({
    query: vi.fn(),
    readLiveState: vi.fn(),
    applyToLive: vi.fn(),
    checkDocumentAccess: vi.fn(),
    checkDocumentWriteAccess: vi.fn(),
  }));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../services/docs/snapshotRestore.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/docs/snapshotRestore.js')>()),
  readLiveState,
  applyToLive,
}));
vi.mock('./documentAccess.js', () => ({ checkDocumentAccess, checkDocumentWriteAccess }));
vi.mock('@gruenerator/hocuspocus', () => ({ blockNoteXmlToHtml: () => '' }));

const { docSnapshotsContractRouter } = await import('./docSnapshotsContractRouter.js');

type Result = { status: number; body: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const handler = (name: keyof typeof docSnapshotsContractRouter) =>
  docSnapshotsContractRouter[name] as unknown as Handler;

function docState(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getXmlFragment('document-store').insert(0, [new Y.XmlText(text)]);
  return Y.encodeStateAsUpdate(doc);
}

const VERSION_STATE = docState('alte Version');
const LIVE_STATE = docState('aktueller Stand');

let inserted: string[];
let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  calls = [];
  checkDocumentAccess.mockResolvedValue({ hasAccess: true, accessMethod: 'owner' });
  checkDocumentWriteAccess.mockResolvedValue(true);
  readLiveState.mockResolvedValue(LIVE_STATE);
  applyToLive.mockImplementation(async () => {
    calls.push('apply');
  });
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM collaborative_documents')) {
      return [
        {
          id: 'doc-1',
          created_by: 'owner-1',
          permissions: {},
          is_public: false,
          share_mode: 'private',
        },
      ];
    }
    if (sql.includes('INSERT INTO yjs_document_snapshots')) {
      inserted.push(params[2] as string);
      calls.push(`insert:${params[2] as string}`);
      return [{ version: 10 + inserted.length, created_at: new Date('2026-10-16T10:00:00Z') }];
    }
    if (sql.includes('SELECT snapshot_data FROM yjs_document_snapshots')) {
      return params[1] === 3 ? [{ snapshot_data: gzipSync(Buffer.from(VERSION_STATE)) }] : [];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
});

const req = (id: string | null = 'owner-1') => (id ? { user: { id } } : {});
const restore = (body: unknown, version = 3) =>
  handler('restore')({ req: req(), params: { id: 'doc-1', version }, body });

describe('restore', () => {
  it('saves the live content first, then applies the version live', async () => {
    const res = await restore({ apply: 'live' });

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      'insert:Vor der Wiederherstellung',
      'apply',
      'insert:Wiederhergestellt von v3',
    ]);

    const live = new Y.Doc();
    Y.applyUpdate(live, LIVE_STATE);
    Y.applyUpdate(live, applyToLive.mock.calls[0][1] as Uint8Array);
    expect(live.getXmlFragment('document-store').toString()).toBe('alte Version');
  });

  it('restores nothing when the live state cannot be read', async () => {
    readLiveState.mockRejectedValue(new Error('hocuspocus down'));

    const res = await restore({ apply: 'live' });

    expect(res.status).toBe(500);
    expect(inserted).toEqual([]);
    expect(applyToLive).not.toHaveBeenCalled();
  });

  it('gives tabs without `apply` the backup and applies nothing server-side', async () => {
    const res = await restore(undefined);

    expect(res.status).toBe(200);
    expect(inserted).toEqual(['Vor der Wiederherstellung']);
    expect(applyToLive).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('yjs_document_updates'))).toBe(
      false
    );
  });

  it('refuses people Hocuspocus would not let edit, before touching anything', async () => {
    checkDocumentWriteAccess.mockResolvedValue(false);

    const res = await restore({ apply: 'live' });

    expect(res.status).toBe(403);
    expect(readLiveState).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
    expect(applyToLive).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown version without saving a backup', async () => {
    const res = await restore({ apply: 'live' }, 99);

    expect(res.status).toBe(404);
    expect(inserted).toEqual([]);
  });

  it('answers 401 without a user', async () => {
    const res = await handler('restore')({
      req: req(null),
      params: { id: 'doc-1', version: 3 },
      body: { apply: 'live' },
    });
    expect(res.status).toBe(401);
  });
});

describe('list', () => {
  it('groups unnamed auto-saves within 30 minutes and sends ISO timestamps', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM collaborative_documents')) {
        return [
          {
            id: 'doc-1',
            created_by: 'owner-1',
            permissions: {},
            is_public: false,
            share_mode: 'private',
          },
        ];
      }
      return [
        {
          id: 'c',
          version: 3,
          created_at: new Date('2026-10-16T10:20:00Z'),
          is_auto_save: true,
          label: null,
          created_by: null,
          created_by_name: null,
        },
        {
          id: 'b',
          version: 2,
          created_at: new Date('2026-10-16T10:00:00Z'),
          is_auto_save: true,
          label: null,
          created_by: null,
          created_by_name: null,
        },
        {
          id: 'a',
          version: 1,
          created_at: new Date('2026-10-16T09:00:00Z'),
          is_auto_save: false,
          label: 'Stand A',
          created_by: 'u-1',
          created_by_name: 'Anna',
        },
      ];
    });

    const res = await handler('list')({ req: req(), params: { id: 'doc-1' }, query: {} });

    expect(res.status).toBe(200);
    expect(res.body.snapshots).toEqual([
      expect.objectContaining({
        version: 3,
        snapshot_count: 2,
        created_at: '2026-10-16T10:20:00.000Z',
      }),
      expect.objectContaining({
        version: 1,
        snapshot_count: 1,
        label: 'Stand A',
        created_by: 'u-1',
      }),
    ]);
  });
});
