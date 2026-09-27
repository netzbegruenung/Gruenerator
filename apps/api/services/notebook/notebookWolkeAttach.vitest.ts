/**
 * `attachWolkeFolderToNotebook` gegen Fakes für Sync, Helper und Datenbank,
 * mit injizierter Uhr. Die Behauptungen sind die Reihenfolge-Garantien aus dem
 * Plan: Ref VOR dem Import, Deckel, Zeitbudget, Fehler → Warteschlange,
 * schon Importiertes ohne `processFile`, genau zwei Collection-Schreibvorgänge.
 */
import { describe, expect, it, vi } from 'vitest';

import { attachWolkeFolderToNotebook, type AttachDeps } from './notebookWolkeAttach.js';

import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';
import type { NextcloudFile } from '../sync/types.js';

const SHARE_LINK = {
  id: 'link-1',
  share_link: 'https://wolke.example/s/AbC',
  label: 'Anträge',
  base_url: null,
  share_token: null,
  is_active: true,
  created_at: '2026-01-01',
};

function file(name: string, size = 1024): NextcloudFile {
  return { name, href: `/remote.php/dav/${name}`, size, etag: `e-${name}` };
}

interface FakeOptions {
  files?: NextcloudFile[];
  imported?: Array<{ id: string; path: string }>;
  existingFolders?: unknown[];
  existingDocIds?: string[];
  /** Ergebnis je Datei — `Error` wirft. */
  processResult?: (f: NextcloudFile) => { documentId: string } | Error;
  /** Millisekunden, die jeder `processFile`-Aufruf die Uhr vorstellt. */
  msPerFile?: number;
}

function fakes(opts: FakeOptions = {}) {
  let clock = 1_000;
  const settings: Record<string, unknown> = { wolke_folders: opts.existingFolders ?? [] };
  const collection = {
    id: 'n1',
    user_id: 'u1',
    name: 'Kreisverband',
    settings,
    document_count: opts.existingDocIds?.length ?? 0,
  } as unknown as NotebookCollection;

  const processFile = vi.fn(async (_u: string, _s: string, f: NextcloudFile) => {
    clock += opts.msPerFile ?? 0;
    const r = opts.processResult?.(f) ?? { documentId: `doc-${f.name}` };
    if (r instanceof Error) throw r;
    return { success: true, ...r };
  });
  const updateNotebookCollection = vi.fn(async () => ({ success: true }));
  const addDocumentsToCollection = vi.fn(async (_id: string, ids: string[]) => ({
    success: true,
    added_count: ids.length,
  }));
  const insertPending = vi.fn(async (input: { files: NextcloudFile[] }) => input.files.length);

  const deps: AttachDeps = {
    sync: {
      getShareLink: vi.fn(async () => SHARE_LINK),
      listSupportedFilesInFolder: vi.fn(async () => opts.files ?? []),
      processFile,
    },
    helper: {
      getNotebookCollection: vi.fn(async () => collection),
      updateNotebookCollection,
      addDocumentsToCollection,
      getCollectionDocuments: vi.fn(async () =>
        (opts.existingDocIds ?? []).map((document_id) => ({
          document_id,
          added_at: '',
          added_by: null,
        }))
      ),
    },
    findImported: vi.fn(async () => opts.imported ?? []),
    insertPending,
    now: () => clock,
  };
  return { deps, processFile, updateNotebookCollection, addDocumentsToCollection, insertPending };
}

const INPUT = {
  userId: 'u1',
  collectionId: 'n1',
  shareLinkId: 'link-1',
  folderPath: 'Anträge/2026',
  includeSubfolders: false,
};

describe('attachWolkeFolderToNotebook', () => {
  it('writes the folder ref BEFORE importing anything', async () => {
    const order: string[] = [];
    const { deps } = fakes({ files: [file('a.pdf')] });
    (deps.helper.updateNotebookCollection as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        order.push('update');
        return { success: true };
      }
    );
    (deps.sync.processFile as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('process');
      return { success: true, documentId: 'doc-a' };
    });
    await attachWolkeFolderToNotebook(INPUT, deps);
    expect(order[0]).toBe('update');
    expect(order.indexOf('process')).toBeGreaterThan(0);

    const firstWrite = (deps.helper.updateNotebookCollection as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, { settings: { wolke_folders: unknown[] } }];
    expect(firstWrite[1].settings.wolke_folders).toEqual([
      expect.objectContaining({
        shareLinkId: 'link-1',
        shareLabel: 'Anträge',
        folderPath: 'Anträge/2026',
        folderName: '2026',
        includeSubfolders: false,
      }),
    ]);
  });

  it('imports inline up to maxInline and queues the rest', async () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => file(`${n}.pdf`));
    const { deps, processFile, insertPending, addDocumentsToCollection } = fakes({ files });
    const out = await attachWolkeFolderToNotebook({ ...INPUT, maxInline: 5 }, deps);
    expect(processFile).toHaveBeenCalledTimes(5);
    expect(out).toEqual({
      folderName: '2026',
      total: 7,
      alreadyImported: 0,
      importedNow: 5,
      queued: 2,
      failed: 0,
    });
    const queued = (insertPending.mock.calls[0] as unknown as [{ files: NextcloudFile[] }])[0];
    expect(queued.files.map((f) => f.name)).toEqual(['f.pdf', 'g.pdf']);
    expect(addDocumentsToCollection).toHaveBeenCalledWith(
      'n1',
      ['doc-a.pdf', 'doc-b.pdf', 'doc-c.pdf', 'doc-d.pdf', 'doc-e.pdf'],
      'u1'
    );
  });

  // OCR ist seitenweise abgerechnet und langsam; der Deckel hält `executeAction`
  // unter der 120-s-Claim-TTL des pendingActionStore.
  it('stops importing when the time budget is spent', async () => {
    const files = ['a', 'b', 'c'].map((n) => file(`${n}.pdf`));
    const { deps, processFile } = fakes({ files, msPerFile: 40_000 });
    const out = await attachWolkeFolderToNotebook(
      { ...INPUT, maxInline: 5, inlineBudgetMs: 60_000 },
      deps
    );
    expect(processFile).toHaveBeenCalledTimes(2);
    expect(out.importedNow).toBe(2);
    expect(out.queued).toBe(1);
  });

  it('queues a file that fails instead of losing it', async () => {
    const files = [file('ok.pdf'), file('broken.pdf'), file('later.pdf')];
    const { deps, insertPending } = fakes({
      files,
      processResult: (f) =>
        f.name === 'broken.pdf' ? new Error('OCR 500') : { documentId: f.name },
    });
    const out = await attachWolkeFolderToNotebook(INPUT, deps);
    expect(out.failed).toBe(1);
    expect(out.importedNow).toBe(2);
    expect(out.queued).toBe(1);
    const queued = (insertPending.mock.calls[0] as unknown as [{ files: NextcloudFile[] }])[0];
    expect(queued.files.map((f) => f.name)).toEqual(['broken.pdf']);
  });

  it('skips files above the inline size cap and queues them', async () => {
    const { deps, processFile } = fakes({ files: [file('huge.pdf', 30 * 1024 * 1024)] });
    const out = await attachWolkeFolderToNotebook(INPUT, deps);
    expect(processFile).not.toHaveBeenCalled();
    expect(out.queued).toBe(1);
  });

  it('attaches already-imported files without calling processFile', async () => {
    const files = [file('old.pdf'), file('new.pdf')];
    const { deps, processFile, addDocumentsToCollection } = fakes({
      files,
      imported: [{ id: 'doc-old', path: '/remote.php/dav/old.pdf' }],
    });
    const out = await attachWolkeFolderToNotebook(INPUT, deps);
    expect(processFile).toHaveBeenCalledTimes(1);
    expect(out.alreadyImported).toBe(1);
    expect(out.importedNow).toBe(1);
    expect(addDocumentsToCollection).toHaveBeenCalledWith('n1', ['doc-old', 'doc-new.pdf'], 'u1');
  });

  // `updateNotebookCollection` ist read-modify-write und embeddet neu — jeder
  // Schreibvorgang kostet. Einer für die Ref, einer für Zähler + lastSyncedAt.
  it('writes the collection exactly twice', async () => {
    const { deps, updateNotebookCollection } = fakes({
      files: [file('a.pdf')],
      existingDocIds: ['doc-x'],
    });
    await attachWolkeFolderToNotebook(INPUT, deps);
    expect(updateNotebookCollection).toHaveBeenCalledTimes(2);
    const last = updateNotebookCollection.mock.calls[1] as unknown as [
      string,
      { document_count: number; settings: { wolke_folders: Array<{ lastSyncedAt: string }> } },
    ];
    expect(last[1].document_count).toBe(2);
    expect(last[1].settings.wolke_folders[0].lastSyncedAt).toBeTruthy();
  });

  it('does not duplicate a folder that is already attached', async () => {
    const { deps, updateNotebookCollection } = fakes({
      files: [],
      existingFolders: [{ shareLinkId: 'link-1', folderPath: 'Anträge/2026', folderName: '2026' }],
    });
    await attachWolkeFolderToNotebook(INPUT, deps);
    const last = updateNotebookCollection.mock.calls.at(-1) as unknown as [
      string,
      { settings: { wolke_folders: unknown[] } },
    ];
    expect(last[1].settings.wolke_folders).toHaveLength(1);
  });
});
