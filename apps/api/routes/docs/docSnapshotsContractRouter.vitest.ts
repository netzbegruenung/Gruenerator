/**
 * docSnapshotsContractRouter — the guarantees a restore must keep:
 *  - only people Hocuspocus lets edit may restore (the write goes around its auth);
 *  - the current content is saved BEFORE anything is applied;
 *  - no live state, no restore — a restore without a backup is the data loss
 *    #4624 was about;
 *  - old tabs (no `apply`) get the backup and nothing applied server-side.
 */
import { gzipSync } from 'zlib';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

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
  ...(await importOriginal<object>()),
  readLiveState,
  applyToLive,
}));
vi.mock('./documentAccess.js', () => ({ checkDocumentAccess, checkDocumentWriteAccess }));
// Pass the XML through so a test can see what reaches the HTML renderer.
vi.mock('@gruenerator/hocuspocus', () => ({ blockNoteXmlToHtml: (xml: string) => xml }));

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
    if (sql.includes('SELECT snapshot_data, created_at FROM yjs_document_snapshots')) {
      return [
        {
          snapshot_data: gzipSync(Buffer.from(docState('<img src=x onerror=alert(1)>'))),
          created_at: new Date('2026-10-16T10:00:00Z'),
        },
      ];
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
  const doc = {
    id: 'doc-1',
    created_by: 'owner-1',
    permissions: {},
    is_public: false,
    share_mode: 'private',
  };
  const row = (version: number, at: string, label: string | null = null) => ({
    id: `s-${version}`,
    version,
    created_at: new Date(at),
    is_auto_save: label === null,
    label,
    created_by: label === null ? null : 'u-1',
    created_by_name: label === null ? null : 'Anna',
  });
  // Two auto-saves 20 minutes apart (one group), then a named version.
  const ROWS = [
    row(3, '2026-10-16T10:20:00Z'),
    row(2, '2026-10-16T10:00:00Z'),
    row(1, '2026-10-16T09:00:00Z', 'Stand A'),
  ];

  beforeEach(() => {
    // Applies the cursor ($2) and LIMIT ($3) the way Postgres would.
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM collaborative_documents')) return [doc];
      const [, from, limit] = params as [string, number | null, number];
      return ROWS.filter((r) => from === null || r.version <= from).slice(0, limit);
    });
  });

  const list = (query: Record<string, unknown>) =>
    handler('list')({ req: req(), params: { id: 'doc-1' }, query });

  it('groups unnamed auto-saves within 30 minutes and sends ISO timestamps', async () => {
    const res = await list({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      snapshots: [
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
      ],
      next_cursor: null,
    });
  });

  it('reads past a page boundary so a group is complete, then continues at the cursor', async () => {
    const first = await list({ limit: 1 });
    expect(first.body).toEqual({
      snapshots: [expect.objectContaining({ version: 3, snapshot_count: 2 })],
      next_cursor: '1',
    });

    const second = await list({ limit: 1, cursor: 1 });
    expect(second.body).toEqual({
      snapshots: [expect.objectContaining({ version: 1, label: 'Stand A' })],
      next_cursor: null,
    });
  });

  it('pages ungrouped rows one by one', async () => {
    const res = await list({ grouped: 'false', limit: 2 });
    expect(res.body).toEqual({
      snapshots: [
        expect.objectContaining({ version: 3, snapshot_count: 1 }),
        expect.objectContaining({ version: 2, snapshot_count: 1 }),
      ],
      next_cursor: '1',
    });
  });
});

describe('getPreview', () => {
  // Old tabs render this HTML with dangerouslySetInnerHTML; text typed as
  // markup must arrive escaped (88e17067c3, fragmentToSafeXml).
  it('escapes markup typed into the document', async () => {
    const res = await handler('getPreview')({ req: req(), params: { id: 'doc-1', version: 3 } });
    expect(res.status).toBe(200);
    expect(res.body.html).not.toContain('<img');
    expect(res.body.html).toContain('&lt;img');
  });
});
