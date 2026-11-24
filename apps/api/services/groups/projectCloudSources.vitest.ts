import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckMembership = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('./groupMembership.js', () => ({
  getPostgresAndCheckMembership: mockCheckMembership,
  assertCanShareToGroup: vi.fn(),
}));
vi.mock('./groupShareWriter.js', () => ({ addGroupShare: vi.fn(), removeGroupShare: vi.fn() }));
vi.mock('../sync/WolkeSyncService.js', () => ({ getWolkeSyncService: vi.fn() }));
vi.mock('../sync/storeExtractedDocument.js', () => ({ storeExtractedDocument: vi.fn() }));
vi.mock('../files/googleDriveProvider.js', () => ({ googleDriveProvider: {} }));
vi.mock('../files/nangoDriveAccess.js', () => ({ getNangoAccessToken: vi.fn() }));
vi.mock('../document-services/DocumentProcessingService/textExtraction.js', () => ({
  extractTextFromFile: vi.fn(),
}));
vi.mock('../../utils/integrations/nextcloud/index.js', () => ({ NextcloudShareManager: {} }));

const { NextcloudHttpError } = await import('../api-clients/nextcloudApiClient.js');
const { CloudAccessError } = await import('../files/driveErrors.js');
const {
  MAX_SOURCE_FILES,
  ProjectCloudSourceError,
  attachProjectDriveFiles,
  attachProjectWolkeFolder,
  detachProjectCloudSource,
  driveAdapter,
  driveErrorMessage,
  runAllProjectCloudSources,
  syncProjectCloudSource,
  wolkeAdapter,
  wolkeErrorMessage,
} = await import('./projectCloudSources.js');

type Row = Parameters<typeof syncProjectCloudSource>[0];
type Item = { key: string; name: string; lastModified: number };
type Synced = Record<string, { id: string; v?: string | null }>;

function row(synced: Synced = {}, over: Partial<Row> = {}): Row {
  return {
    id: 's1',
    group_id: 'g1',
    user_id: 'owner',
    provider: 'wolke',
    share_link_id: 'link-1',
    folder_path: '/',
    name: 'Material',
    include_subfolders: true,
    picked_files: [],
    synced_files: synced,
    file_count: Object.keys(synced).length,
    pending_count: 0,
    last_synced_at: null,
    last_error: null,
    ...over,
  };
}

const item = (key: string, lastModified = 0): Item => ({ key, name: key, lastModified });

/** Ein Adapter, dessen Liste und Einlesen der Test vorgibt. */
function fakeAdapter() {
  const state = {
    items: [] as Item[],
    pickedFiles: undefined as unknown,
    open: vi.fn(),
    ingest: vi.fn(),
  };
  state.open.mockImplementation(async () => ({
    items: state.items,
    ingest: state.ingest,
    ...(state.pickedFiles ? { pickedFiles: state.pickedFiles } : {}),
  }));
  return {
    state,
    adapter: { open: state.open, describeError: (e: unknown) => `kaputt: ${String(e)}` },
  };
}

function makeDeps(overrides: { assertCanShare?: (g: string, u: string) => Promise<unknown> } = {}) {
  let clock = 1_000;
  const fake = fakeAdapter();
  const deps = {
    query: vi.fn().mockResolvedValue([]),
    adapters: { wolke: fake.adapter, 'google-drive': fake.adapter },
    addShare: vi.fn().mockResolvedValue(undefined),
    removeShare: vi.fn().mockResolvedValue(undefined),
    assertCanShare: vi.fn().mockResolvedValue(undefined),
    findWolkeLink: vi.fn().mockResolvedValue({ id: 'link-1', label: null }),
    hasGoogleDrive: vi.fn().mockResolvedValue(true),
    now: () => clock,
    tick: (ms: number) => {
      clock += ms;
    },
    fake: fake.state,
    ...overrides,
  };
  return deps;
}

const budget = { maxIngest: 5, deadline: 10_000_000 };

function lastUpdate(deps: ReturnType<typeof makeDeps>) {
  const call = deps.query.mock.calls.find(([sql]) => String(sql).includes('SET synced_files')) as
    [string, unknown[]] | undefined;
  if (!call) throw new Error('no update');
  const [, params] = call;
  return {
    synced: JSON.parse(params[1] as string) as Synced,
    fileCount: params[2],
    pending: params[3],
    picked: params[5],
  };
}

describe('syncProjectCloudSource', () => {
  it('imports new files and shares each one into the project once', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('a'), item('b')];
    deps.fake.ingest
      .mockResolvedValueOnce({ documentId: 'doc-a', version: 'e1', ingested: true })
      .mockResolvedValueOnce({ documentId: 'doc-b', version: 'e2', ingested: true });

    const { summary, error } = await syncProjectCloudSource(row(), budget, deps);

    expect(error).toBeNull();
    expect(summary).toMatchObject({ imported: 2, removed: 0, pending: 0 });
    expect(deps.addShare.mock.calls).toEqual([
      ['g1', 'owner', 'doc-a'],
      ['g1', 'owner', 'doc-b'],
    ]);
    expect(lastUpdate(deps)).toMatchObject({
      synced: { a: { id: 'doc-a', v: 'e1' }, b: { id: 'doc-b', v: 'e2' } },
      fileCount: 2,
      pending: 0,
      picked: null,
    });
  });

  it('does not re-share an unchanged file, keeps its version and does not count it', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('a')];
    deps.fake.ingest.mockResolvedValue({ documentId: 'doc-a', version: 'e9', ingested: false });

    const { summary } = await syncProjectCloudSource(
      row({ a: { id: 'doc-a', v: 'e1' } }),
      budget,
      deps
    );

    expect(summary.imported).toBe(0);
    expect(deps.addShare).not.toHaveBeenCalled();
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps).synced).toEqual({ a: { id: 'doc-a', v: 'e1' } });
  });

  it('removes a file that vanished from the source from the project', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('a')];
    deps.fake.ingest.mockResolvedValue({ documentId: 'doc-a', version: null, ingested: false });

    const { summary } = await syncProjectCloudSource(
      row({ a: { id: 'doc-a' }, gone: { id: 'doc-gone' } }),
      budget,
      deps
    );

    expect(summary.removed).toBe(1);
    expect(deps.removeShare).toHaveBeenCalledWith('g1', 'doc-gone');
  });

  it('defers new files past the budget and keeps known ones without touching them', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('new1', 3), item('new2', 2), item('known', 1)];
    deps.fake.ingest.mockImplementation(async (it: Item) =>
      it.key === 'known'
        ? { documentId: 'doc-known', version: null, ingested: false }
        : { documentId: 'doc-new1', version: null, ingested: true }
    );

    const { summary } = await syncProjectCloudSource(
      row({ known: { id: 'doc-known' } }),
      { maxIngest: 1, deadline: 10_000_000 },
      deps
    );

    // Bekannte zuerst, dann die neueste neue — die zweite wartet.
    expect(deps.fake.ingest.mock.calls.map(([it]) => (it as Item).key)).toEqual(['known', 'new1']);
    expect(summary).toMatchObject({ imported: 1, pending: 1, removed: 0 });
    expect(lastUpdate(deps)).toMatchObject({ fileCount: 2, pending: 1 });
  });

  it('stops ingesting once the deadline has passed', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('a'), item('b')];
    deps.fake.ingest.mockImplementation(async () => {
      deps.tick(5_000);
      return { documentId: 'doc-a', version: null, ingested: true };
    });

    const { summary } = await syncProjectCloudSource(
      row(),
      { maxIngest: 10, deadline: 3_000 },
      deps
    );

    expect(summary).toMatchObject({ imported: 1, pending: 1 });
  });

  it('keeps the known document when a changed file fails to re-import', async () => {
    const deps = makeDeps();
    deps.fake.items = [item('a')];
    deps.fake.ingest.mockRejectedValue(new Error('ocr down'));

    const { summary } = await syncProjectCloudSource(
      row({ a: { id: 'doc-a', v: 'e1' } }),
      budget,
      deps
    );

    expect(summary.failed).toBe(1);
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps).synced).toEqual({ a: { id: 'doc-a', v: 'e1' } });
  });

  it('caps a large source at the newest MAX_SOURCE_FILES files', async () => {
    const deps = makeDeps();
    deps.fake.items = Array.from({ length: MAX_SOURCE_FILES + 3 }, (_, i) => item(`f${i}`, i));

    const { summary } = await syncProjectCloudSource(row(), { maxIngest: 0, deadline: 0 }, deps);

    expect(summary.skipped).toBe(3);
    expect(summary.pending).toBe(MAX_SOURCE_FILES);
  });

  it('keeps already-synced files when newer files would push them past the cap', async () => {
    const deps = makeDeps();
    deps.fake.items = [
      ...Array.from({ length: MAX_SOURCE_FILES }, (_, i) => item(`new${i}`, 100 + i)),
      item('old', 1),
    ];

    const { summary } = await syncProjectCloudSource(
      row({ old: { id: 'doc-old' } }),
      { maxIngest: 0, deadline: 0 },
      deps
    );

    expect(summary).toMatchObject({ removed: 0, skipped: 1 });
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps).synced).toEqual({ old: { id: 'doc-old' } });
  });

  it('writes back the cleaned-up pick list a source reports', async () => {
    const deps = makeDeps();
    deps.fake.items = [];
    deps.fake.pickedFiles = [{ id: 'x', name: 'x', mimeType: 'text/plain' }];
    await syncProjectCloudSource(row({}, { provider: 'google-drive' }), budget, deps);
    expect(JSON.parse(lastUpdate(deps).picked as string)).toEqual([
      { id: 'x', name: 'x', mimeType: 'text/plain' },
    ]);
  });

  it('leaves the stock alone and records the adapter sentence when the source fails', async () => {
    const deps = makeDeps();
    deps.fake.open.mockRejectedValue(new Error('boom'));

    const { error } = await syncProjectCloudSource(row({ a: { id: 'doc-a' } }), budget, deps);

    expect(error).toBe('kaputt: Error: boom');
    expect(deps.removeShare).not.toHaveBeenCalled();
    const [sql, params] = deps.query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/SET last_error = \$2/);
    expect(params).toEqual(['s1', error]);
  });

  it('pauses when the attaching person may no longer share into the project', async () => {
    const deps = makeDeps({
      assertCanShare: vi
        .fn()
        .mockRejectedValue(new Error('Du bist nicht Mitglied dieses Projekts.')),
    });

    const { error } = await syncProjectCloudSource(row(), budget, deps);

    expect(error).toBe('Abgleich pausiert: Du bist nicht Mitglied dieses Projekts.');
    expect(deps.fake.open).not.toHaveBeenCalled();
  });
});

describe('wolkeAdapter', () => {
  const file = { name: 'a.pdf', href: '/public.php/webdav/a.pdf', size: 1, etag: 'e1' };
  function sync() {
    return {
      getShareLink: vi.fn().mockResolvedValue({ id: 'link-1' }),
      listSupportedFilesInFolder: vi.fn().mockResolvedValue([file]),
      processFile: vi.fn(),
    };
  }

  it('reads with the link of the attaching person and keys files by href', async () => {
    const s = sync();
    s.processFile.mockResolvedValue({ success: true, documentId: 'doc-a' });
    const session = await wolkeAdapter(s as never).open(row());
    expect(s.getShareLink).toHaveBeenCalledWith('owner', 'link-1');
    expect(session.items.map((i) => i.key)).toEqual([file.href]);
    expect(await session.ingest(session.items[0], undefined)).toEqual({
      documentId: 'doc-a',
      version: 'e1',
      ingested: true,
    });
  });

  it('counts an up-to-date file as not ingested', async () => {
    const s = sync();
    s.processFile.mockResolvedValue({ skipped: true, reason: 'up_to_date', documentId: 'doc-a' });
    const session = await wolkeAdapter(s as never).open(row());
    expect(await session.ingest(session.items[0], { id: 'doc-a' })).toMatchObject({
      documentId: 'doc-a',
      ingested: false,
    });
  });

  it('never passes a raw WebDAV message through', () => {
    expect(wolkeErrorMessage(new Error('ECONNRESET at socket'))).toMatch(/nicht geantwortet/);
    expect(wolkeErrorMessage(new NextcloudHttpError('x', 401))).toMatch(
      /Freigabelink gilt nicht mehr/
    );
    expect(wolkeErrorMessage(new NextcloudHttpError('x', 405))).toMatch(/Ablage-Freigabe/);
    expect(wolkeErrorMessage(new Error('Share link not found'))).toMatch(/Wolke-Verbindung/);
  });
});

describe('driveAdapter', () => {
  const meta = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: `${id}.pdf`,
    mimeType: 'application/pdf',
    modifiedTime: '2026-11-20T10:00:00.000Z',
    ...over,
  });
  function deps() {
    return {
      token: vi.fn().mockResolvedValue('tok'),
      getFile: vi.fn(),
      read: vi.fn().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'application/pdf' }),
      extractText: vi.fn().mockResolvedValue('Inhalt'),
      store: vi.fn().mockResolvedValue({ stored: true, documentId: 'doc-1', vectorsCreated: 1 }),
    };
  }
  const driveRow = (picked: string[]) =>
    row(
      {},
      {
        provider: 'google-drive',
        share_link_id: '',
        folder_path: '',
        picked_files: picked.map((id) => ({ id, name: id, mimeType: 'application/pdf' })),
      }
    );

  it('drops deleted, trashed and no-longer-shared files from the pick list', async () => {
    const d = deps();
    d.getFile.mockImplementation(async (_t: string, id: string) => {
      if (id === 'gone') throw new CloudAccessError('not_found', 'weg');
      if (id === 'bin') return meta(id, { trashed: true });
      return meta(id);
    });
    const session = await driveAdapter(d).open(driveRow(['keep', 'gone', 'bin']));
    expect(session.items.map((i) => i.key)).toEqual(['keep']);
    expect(session.pickedFiles?.map((f) => f.id)).toEqual(['keep']);
    expect(d.token).toHaveBeenCalledWith('owner');
  });

  it('fails the whole source when the Google grant expired', async () => {
    const d = deps();
    d.getFile.mockRejectedValue(new CloudAccessError('reauth', 'x'));
    const err = await driveAdapter(d)
      .open(driveRow(['a']))
      .catch((e: unknown) => e);
    expect(driveErrorMessage(err)).toMatch(/neu verbinden/);
  });

  it('skips the download while modifiedTime is unchanged', async () => {
    const d = deps();
    d.getFile.mockResolvedValue(meta('a'));
    const session = await driveAdapter(d).open(driveRow(['a']));
    const out = await session.ingest(session.items[0], {
      id: 'doc-a',
      v: '2026-11-20T10:00:00.000Z',
    });
    expect(out).toEqual({
      documentId: 'doc-a',
      version: '2026-11-20T10:00:00.000Z',
      ingested: false,
    });
    expect(d.read).not.toHaveBeenCalled();
  });

  it('re-imports a changed file into the same document', async () => {
    const d = deps();
    d.getFile.mockResolvedValue(meta('a', { modifiedTime: '2026-11-21T08:00:00.000Z' }));
    const session = await driveAdapter(d).open(driveRow(['a']));
    const out = await session.ingest(session.items[0], { id: 'doc-a', v: 'old' });
    expect(d.read).toHaveBeenCalledWith('owner', 'a');
    expect(d.store).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        existingDocumentId: 'doc-a',
        text: 'Inhalt',
        create: expect.objectContaining({ sourceType: 'google_drive' }),
      })
    );
    expect(out).toEqual({
      documentId: 'doc-1',
      version: '2026-11-21T08:00:00.000Z',
      ingested: true,
    });
  });

  it('does not read a format the extraction cannot handle', async () => {
    const d = deps();
    d.getFile.mockResolvedValue(
      meta('f', { name: 'Umfrage', mimeType: 'application/vnd.google-apps.form' })
    );
    const session = await driveAdapter(d).open(driveRow(['f']));
    expect(await session.ingest(session.items[0], undefined)).toMatchObject({
      documentId: null,
      ingested: false,
    });
    expect(d.read).not.toHaveBeenCalled();
  });
});

describe('attachProjectWolkeFolder', () => {
  beforeEach(() => {
    mockCheckMembership.mockReset().mockResolvedValue({ isAdmin: true });
  });

  it('requires a project admin', async () => {
    mockCheckMembership.mockRejectedValue(new Error('Nur Admins …'));
    const deps = makeDeps();
    await expect(
      attachProjectWolkeFolder(
        { groupId: 'g1', userId: 'u', url: 'https://w/s/abc', includeSubfolders: true },
        deps
      )
    ).rejects.toThrow('Nur Admins');
    expect(mockCheckMembership).toHaveBeenCalledWith('g1', 'u', true);
    expect(deps.query).not.toHaveBeenCalled();
  });

  it('answers 400 for something that is not a share link', async () => {
    const deps = makeDeps();
    deps.findWolkeLink.mockRejectedValue(new Error('Invalid'));
    const err = await attachProjectWolkeFolder(
      { groupId: 'g1', userId: 'u', url: 'nope', includeSubfolders: true },
      deps
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProjectCloudSourceError);
    expect((err as InstanceType<typeof ProjectCloudSourceError>).status).toBe(400);
  });

  it('answers 409 when the folder is already attached', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([]); // INSERT … DO NOTHING
    const err = await attachProjectWolkeFolder(
      { groupId: 'g1', userId: 'u', url: 'https://w/s/abc', includeSubfolders: true },
      deps
    ).catch((e: unknown) => e);
    expect((err as InstanceType<typeof ProjectCloudSourceError>).status).toBe(409);
  });

  it('stores the link of the attaching person, an optional name, and runs a first sync', async () => {
    const deps = makeDeps();
    const stored = { ...row(), user_id: 'u', name: 'Protokolle', attached_by_name: 'Ada' };
    deps.query
      .mockResolvedValueOnce([{ id: 's1' }]) // INSERT
      .mockResolvedValue([stored]);

    const out = await attachProjectWolkeFolder(
      {
        groupId: 'g1',
        userId: 'u',
        url: 'https://w/s/abc',
        includeSubfolders: false,
        name: ' Protokolle ',
      },
      deps
    );

    const [sql, params] = deps.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO group_cloud_sources/);
    expect(params).toEqual(['g1', 'u', 'link-1', 'Protokolle', false]);
    expect(deps.findWolkeLink).toHaveBeenCalledWith('u', 'https://w/s/abc');
    expect(out.source).toMatchObject({ id: 's1', provider: 'wolke', attachedByName: 'Ada' });
  });
});

describe('attachProjectDriveFiles', () => {
  beforeEach(() => mockCheckMembership.mockReset().mockResolvedValue({ isAdmin: true }));
  const pick = (id: string) => ({ id, name: id, mimeType: 'application/pdf' });

  it('asks to connect Google Drive first', async () => {
    const deps = makeDeps();
    deps.hasGoogleDrive.mockResolvedValue(false);
    const err = await attachProjectDriveFiles(
      { groupId: 'g1', userId: 'u', files: [pick('a')] },
      deps
    ).catch((e: unknown) => e);
    expect((err as InstanceType<typeof ProjectCloudSourceError>).status).toBe(400);
    expect(deps.query).not.toHaveBeenCalled();
  });

  it('appends a new pick to the existing selection without duplicates', async () => {
    const deps = makeDeps();
    const source = row({}, { provider: 'google-drive', user_id: 'u' });
    deps.query
      .mockResolvedValueOnce([{ id: 's1', picked_files: [pick('a')] }]) // upsert
      .mockResolvedValueOnce([]) // picked_files update
      .mockResolvedValue([source]);

    await attachProjectDriveFiles(
      { groupId: 'g1', userId: 'u', files: [pick('a'), pick('b')] },
      deps
    );

    const [sql, params] = deps.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/SET picked_files/);
    expect(JSON.parse(params[1] as string).map((f: { id: string }) => f.id)).toEqual(['a', 'b']);
  });
});

describe('detachProjectCloudSource', () => {
  beforeEach(() => mockCheckMembership.mockReset().mockResolvedValue({ isAdmin: true }));

  it('takes every file of the source out of the project', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([row({ a: { id: 'doc-a' }, b: { id: 'doc-b' } })]);
    await detachProjectCloudSource({ groupId: 'g1', userId: 'admin', sourceId: 's1' }, deps);
    expect(deps.query.mock.calls[1]?.[0]).toMatch(/DELETE FROM group_cloud_sources/);
    expect(deps.removeShare.mock.calls).toEqual([
      ['g1', 'doc-a'],
      ['g1', 'doc-b'],
    ]);
  });

  it('answers 404 for a source of another project', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([]);
    await expect(
      detachProjectCloudSource({ groupId: 'g1', userId: 'admin', sourceId: 's9' }, deps)
    ).rejects.toBeInstanceOf(ProjectCloudSourceError);
  });
});

describe('runAllProjectCloudSources', () => {
  it('skips deleted and archived projects and syncs the oldest first', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([row()]);
    const result = await runAllProjectCloudSources(deps);
    const [sql] = deps.query.mock.calls[0] as [string];
    expect(sql).toMatch(/g\.deleted_at IS NULL AND g\.archived_at IS NULL/);
    expect(sql).toMatch(/ORDER BY s\.last_synced_at ASC NULLS FIRST/);
    expect(result.scannedSources).toBe(1);
  });
});
