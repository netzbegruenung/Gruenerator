import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckMembership = vi.fn();
const mockFindOrSave = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('./groupMembership.js', () => ({
  getPostgresAndCheckMembership: mockCheckMembership,
  assertCanShareToGroup: vi.fn(),
}));
vi.mock('./groupShareWriter.js', () => ({ addGroupShare: vi.fn(), removeGroupShare: vi.fn() }));
vi.mock('../sync/WolkeSyncService.js', () => ({ getWolkeSyncService: vi.fn() }));
vi.mock('../../utils/integrations/nextcloud/index.js', () => ({
  NextcloudShareManager: { findOrSaveShareLink: mockFindOrSave },
}));

const { NextcloudHttpError } = await import('../api-clients/nextcloudApiClient.js');
const {
  MAX_FOLDER_FILES,
  ProjectWolkeFolderError,
  attachProjectWolkeFolder,
  detachProjectWolkeFolder,
  runAllProjectWolkeFolders,
  syncProjectWolkeFolder,
  wolkeErrorMessage,
} = await import('./projectWolkeFolders.js');

const file = (name: string, extra: Partial<{ etag: string; lastModified: string }> = {}) => ({
  name,
  href: `/public.php/webdav/${name}`,
  size: 100,
  ...extra,
});

function row(synced: Record<string, string> = {}) {
  return {
    id: 'f1',
    group_id: 'g1',
    user_id: 'owner',
    share_link_id: 'link-1',
    folder_path: '/',
    folder_name: 'Material',
    include_subfolders: true,
    synced_files: synced,
    file_count: Object.keys(synced).length,
    pending_count: 0,
    last_synced_at: null,
    last_error: null,
  };
}

function makeDeps(overrides: { assertCanShare?: (g: string, u: string) => Promise<unknown> } = {}) {
  let clock = 1_000;
  const deps = {
    query: vi.fn().mockResolvedValue([]),
    sync: {
      getShareLink: vi.fn().mockResolvedValue({ id: 'link-1', share_link: 'x' }),
      listSupportedFilesInFolder: vi.fn().mockResolvedValue([]),
      processFile: vi.fn(),
    },
    addShare: vi.fn().mockResolvedValue(undefined),
    removeShare: vi.fn().mockResolvedValue(undefined),
    assertCanShare: vi.fn().mockResolvedValue(undefined),
    now: () => clock,
    tick: (ms: number) => {
      clock += ms;
    },
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
    synced: JSON.parse(params[1] as string) as Record<string, string>,
    fileCount: params[2],
    pending: params[3],
  };
}

describe('syncProjectWolkeFolder', () => {
  it('imports new files and shares each one into the project once', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([file('a.pdf'), file('b.md')]);
    deps.sync.processFile
      .mockResolvedValueOnce({ success: true, documentId: 'doc-a' })
      .mockResolvedValueOnce({ success: true, documentId: 'doc-b' });

    const { summary, error } = await syncProjectWolkeFolder(row(), budget, deps);

    expect(error).toBeNull();
    expect(summary).toMatchObject({ imported: 2, removed: 0, pending: 0 });
    expect(deps.addShare.mock.calls).toEqual([
      ['g1', 'owner', 'doc-a'],
      ['g1', 'owner', 'doc-b'],
    ]);
    expect(lastUpdate(deps)).toMatchObject({ fileCount: 2, pending: 0 });
    // Gelesen wird mit dem Link der anhängenden Person, nicht der klickenden.
    expect(deps.sync.getShareLink).toHaveBeenCalledWith('owner', 'link-1');
  });

  it('does not re-share an unchanged file and does not count it as imported', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([file('a.pdf')]);
    deps.sync.processFile.mockResolvedValue({
      skipped: true,
      reason: 'up_to_date',
      documentId: 'doc-a',
    });

    const { summary } = await syncProjectWolkeFolder(
      row({ '/public.php/webdav/a.pdf': 'doc-a' }),
      budget,
      deps
    );

    expect(summary.imported).toBe(0);
    expect(deps.addShare).not.toHaveBeenCalled();
    expect(deps.removeShare).not.toHaveBeenCalled();
  });

  it('removes a file that vanished from the folder from the project', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([file('a.pdf')]);
    deps.sync.processFile.mockResolvedValue({ skipped: true, documentId: 'doc-a' });

    const { summary } = await syncProjectWolkeFolder(
      row({ '/public.php/webdav/a.pdf': 'doc-a', '/public.php/webdav/gone.pdf': 'doc-gone' }),
      budget,
      deps
    );

    expect(summary.removed).toBe(1);
    expect(deps.removeShare).toHaveBeenCalledWith('g1', 'doc-gone');
    expect(lastUpdate(deps).synced).toEqual({ '/public.php/webdav/a.pdf': 'doc-a' });
  });

  it('defers new files past the budget and keeps known ones without touching them', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([
      file('new1.pdf'),
      file('new2.pdf'),
      file('known.pdf'),
    ]);
    // Die bekannte Datei ist unverändert (ETag) und kostet kein Budget.
    deps.sync.processFile.mockImplementation(async (_u: string, _l: string, f: { href: string }) =>
      f.href.endsWith('known.pdf')
        ? { skipped: true, reason: 'up_to_date', documentId: 'doc-known' }
        : { success: true, documentId: 'doc-new1' }
    );

    const { summary } = await syncProjectWolkeFolder(
      row({ '/public.php/webdav/known.pdf': 'doc-known' }),
      { maxIngest: 1, deadline: 10_000_000 },
      deps
    );

    expect(deps.sync.processFile).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ imported: 1, pending: 1, removed: 0 });
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps)).toMatchObject({ fileCount: 2, pending: 1 });
  });

  it('stops ingesting once the deadline has passed', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([file('a.pdf'), file('b.pdf')]);
    deps.sync.processFile.mockImplementation(async () => {
      deps.tick(5_000);
      return { success: true, documentId: 'doc-a' };
    });

    const { summary } = await syncProjectWolkeFolder(
      row(),
      { maxIngest: 10, deadline: 3_000 },
      deps
    );

    expect(summary).toMatchObject({ imported: 1, pending: 1 });
  });

  it('keeps the known document when a changed file fails to re-import', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([file('a.pdf')]);
    deps.sync.processFile.mockRejectedValue(new Error('ocr down'));

    const { summary } = await syncProjectWolkeFolder(
      row({ '/public.php/webdav/a.pdf': 'doc-a' }),
      budget,
      deps
    );

    expect(summary.failed).toBe(1);
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps).synced).toEqual({ '/public.php/webdav/a.pdf': 'doc-a' });
  });

  it('caps a large folder at the newest MAX_FOLDER_FILES files', async () => {
    const deps = makeDeps();
    const files = Array.from({ length: MAX_FOLDER_FILES + 3 }, (_, i) =>
      file(`f${i}.md`, { lastModified: new Date(2026, 0, 1 + i).toISOString() })
    );
    deps.sync.listSupportedFilesInFolder.mockResolvedValue(files);
    deps.sync.processFile.mockResolvedValue({ skipped: true, reason: 'no_content' });

    const { summary } = await syncProjectWolkeFolder(row(), { maxIngest: 0, deadline: 0 }, deps);

    expect(summary.skipped).toBe(3);
    expect(summary.pending).toBe(MAX_FOLDER_FILES);
  });

  it('keeps already-synced files when newer files would push them past the cap', async () => {
    const deps = makeDeps();
    const old = file('old.pdf', { lastModified: new Date(2020, 0, 1).toISOString() });
    const newer = Array.from({ length: MAX_FOLDER_FILES }, (_, i) =>
      file(`new${i}.md`, { lastModified: new Date(2026, 0, 1 + i).toISOString() })
    );
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([...newer, old]);
    deps.sync.processFile.mockResolvedValue({ skipped: true, reason: 'no_content' });

    const { summary } = await syncProjectWolkeFolder(
      row({ [old.href]: 'doc-old' }),
      { maxIngest: 0, deadline: 0 },
      deps
    );

    expect(summary.removed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(deps.removeShare).not.toHaveBeenCalled();
    expect(lastUpdate(deps).synced).toEqual({ [old.href]: 'doc-old' });
  });

  it('leaves the stock alone and records a readable error when the share is gone', async () => {
    const deps = makeDeps();
    deps.sync.listSupportedFilesInFolder.mockRejectedValue(
      new NextcloudHttpError('Request failed', 401)
    );

    const { error } = await syncProjectWolkeFolder(
      row({ '/public.php/webdav/a.pdf': 'doc-a' }),
      budget,
      deps
    );

    expect(error).toMatch(/Freigabelink gilt nicht mehr/);
    expect(deps.removeShare).not.toHaveBeenCalled();
    const [sql, params] = deps.query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/SET last_error = \$2/);
    expect(params).toEqual(['f1', error]);
  });

  it('pauses when the attaching person may no longer share into the project', async () => {
    const deps = makeDeps({
      assertCanShare: vi
        .fn()
        .mockRejectedValue(new Error('Du bist nicht Mitglied dieses Projekts.')),
    });

    const { error } = await syncProjectWolkeFolder(row(), budget, deps);

    expect(error).toBe('Abgleich pausiert: Du bist nicht Mitglied dieses Projekts.');
    expect(deps.sync.listSupportedFilesInFolder).not.toHaveBeenCalled();
  });
});

describe('wolkeErrorMessage', () => {
  it('never passes a raw WebDAV message through', () => {
    expect(wolkeErrorMessage(new Error('ECONNRESET at socket'))).toMatch(/nicht geantwortet/);
    expect(wolkeErrorMessage(new NextcloudHttpError('x', 405))).toMatch(/Ablage-Freigabe/);
    expect(wolkeErrorMessage(new Error('Share link not found'))).toMatch(/Wolke-Verbindung/);
  });
});

describe('attachProjectWolkeFolder', () => {
  beforeEach(() => {
    mockCheckMembership.mockReset().mockResolvedValue({ isAdmin: true });
    mockFindOrSave.mockReset().mockResolvedValue({ id: 'link-1', label: null });
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
    mockFindOrSave.mockRejectedValue(new Error('Invalid'));
    const err = await attachProjectWolkeFolder(
      { groupId: 'g1', userId: 'u', url: 'nope', includeSubfolders: true },
      makeDeps()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProjectWolkeFolderError);
    expect((err as InstanceType<typeof ProjectWolkeFolderError>).status).toBe(400);
  });

  it('answers 409 when the folder is already attached', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([]); // INSERT … DO NOTHING
    const err = await attachProjectWolkeFolder(
      { groupId: 'g1', userId: 'u', url: 'https://w/s/abc', includeSubfolders: true },
      deps
    ).catch((e: unknown) => e);
    expect((err as InstanceType<typeof ProjectWolkeFolderError>).status).toBe(409);
  });

  it('stores the link of the attaching person and runs a first sync', async () => {
    const deps = makeDeps();
    const stored = { ...row(), user_id: 'u', attached_by_name: 'Ada' };
    deps.query
      .mockResolvedValueOnce([{ id: 'f1' }]) // INSERT
      .mockResolvedValueOnce([stored]) // load
      .mockResolvedValue([stored]);
    deps.sync.listSupportedFilesInFolder.mockResolvedValue([]);

    const out = await attachProjectWolkeFolder(
      { groupId: 'g1', userId: 'u', url: 'https://w/s/abc', includeSubfolders: false },
      deps
    );

    const [sql, params] = deps.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO group_wolke_folders/);
    expect(params).toEqual(['g1', 'u', 'link-1', '/', 'Wolke-Ordner', false]);
    expect(mockFindOrSave).toHaveBeenCalledWith('u', 'https://w/s/abc');
    expect(out.folder).toMatchObject({ id: 'f1', attachedByName: 'Ada' });
  });
});

describe('detachProjectWolkeFolder', () => {
  beforeEach(() => mockCheckMembership.mockReset().mockResolvedValue({ isAdmin: true }));

  it('takes every file of the folder out of the project', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([row({ a: 'doc-a', b: 'doc-b' })]);
    await detachProjectWolkeFolder({ groupId: 'g1', userId: 'admin', folderId: 'f1' }, deps);
    expect(deps.query.mock.calls[1]?.[0]).toMatch(/DELETE FROM group_wolke_folders/);
    expect(deps.removeShare.mock.calls).toEqual([
      ['g1', 'doc-a'],
      ['g1', 'doc-b'],
    ]);
  });

  it('answers 404 for a folder of another project', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([]);
    await expect(
      detachProjectWolkeFolder({ groupId: 'g1', userId: 'admin', folderId: 'f9' }, deps)
    ).rejects.toBeInstanceOf(ProjectWolkeFolderError);
  });
});

describe('runAllProjectWolkeFolders', () => {
  it('skips deleted and archived projects and syncs the oldest first', async () => {
    const deps = makeDeps();
    deps.query.mockResolvedValueOnce([row()]);
    const result = await runAllProjectWolkeFolders(deps);
    const [sql] = deps.query.mock.calls[0] as [string];
    expect(sql).toMatch(/g\.deleted_at IS NULL AND g\.archived_at IS NULL/);
    expect(sql).toMatch(/ORDER BY f\.last_synced_at ASC NULLS FIRST/);
    expect(result.scannedFolders).toBe(1);
  });
});
