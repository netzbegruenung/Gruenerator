/**
 * Papierkorb for notebooks. A notebook lives only in Qdrant, so "trashed" is a
 * `deleted_at` payload field on its `notebook_collections` point, and every
 * reader of that collection must filter it out via `liveOnly`. The last block
 * reads the source to hold that for readers added later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { scrollDocuments, batchDelete, setPayload, deletePayload, reportBackgroundError, effects } =
  vi.hoisted(() => {
    const log: string[] = [];
    return {
      effects: log,
      scrollDocuments: vi.fn(),
      batchDelete: vi.fn((collection: string) => {
        log.push(`delete ${collection}`);
        return Promise.resolve({ success: true });
      }),
      setPayload: vi.fn(),
      deletePayload: vi.fn(),
      reportBackgroundError: vi.fn(),
    };
  });

vi.mock('./QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    client: {},
    collections: {
      notebook_collections: 'notebook_collections',
      notebook_collection_documents: 'notebook_collection_documents',
      notebook_public_access: 'notebook_public_access',
    },
  }),
}));

vi.mock('./QdrantService/operations/index.js', () => ({
  QdrantOperations: class {
    scrollDocuments = scrollDocuments;
    batchDelete = batchDelete;
    client = { setPayload, deletePayload };
  },
}));

vi.mock('./PostgresService.js', () => ({ getPostgresInstance: () => ({ query: vi.fn() }) }));
vi.mock('../../config/systemCollectionsConfig.js', () => ({
  getSystemCollectionConfig: () => null,
}));
vi.mock('../../services/document-services/DocumentProcessingService/index.js', () => ({
  triggerPendingDocProcessing: vi.fn(),
}));
vi.mock('../../services/mistral/index.js', () => ({ mistralEmbeddingService: {} }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const { NotebookQdrantHelper } = await import('./NotebookQdrantHelper.js');

const LIVE = { is_empty: { key: 'deleted_at' } };
const byId = { key: 'collection_id', match: { value: 'nb-1' } };

const point = (payload: Record<string, unknown>) => ({
  id: 1,
  payload: { collection_id: 'nb-1', user_id: 'user-1', name: 'Klima', ...payload },
  vector: null,
});

beforeEach(() => {
  effects.length = 0;
  scrollDocuments.mockReset();
  batchDelete.mockClear();
  setPayload.mockReset();
  deletePayload.mockReset();
  reportBackgroundError.mockReset();
});

describe('readers hide trashed notebooks', () => {
  it('getNotebookCollection asks Qdrant for live points only', async () => {
    scrollDocuments.mockResolvedValueOnce([]);

    expect(await new NotebookQdrantHelper().getNotebookCollection('nb-1')).toBeNull();
    expect(scrollDocuments).toHaveBeenCalledWith(
      'notebook_collections',
      { must: [byId, LIVE] },
      expect.anything()
    );
  });

  it('includeTrashed drops the live filter for the Papierkorb', async () => {
    scrollDocuments.mockResolvedValueOnce([point({ deleted_at: '2026-09-20T10:00:00.000Z' })]);

    const found = await new NotebookQdrantHelper().getNotebookCollection('nb-1', {
      includeTrashed: true,
    });

    expect(found?.id).toBe('nb-1');
    expect(scrollDocuments).toHaveBeenCalledWith(
      'notebook_collections',
      { must: [byId] },
      expect.anything()
    );
  });

  it('list readers append the live filter to their own conditions', async () => {
    scrollDocuments.mockResolvedValue([]);
    const helper = new NotebookQdrantHelper();

    await helper.getUserNotebookCollectionsLight('user-1');
    await helper.getPublicNotebookCollections();

    expect(scrollDocuments.mock.calls.map((c) => c[1])).toEqual([
      { must: [{ key: 'user_id', match: { value: 'user-1' } }, LIVE] },
      { must: [{ key: 'is_public', match: { value: true } }, LIVE] },
    ]);
  });
});

describe('trash and restore', () => {
  it('stamps deleted_at on the collection point and keeps links and tokens', async () => {
    scrollDocuments.mockResolvedValueOnce([point({})]);

    expect(await new NotebookQdrantHelper().trashNotebookCollection('nb-1')).toBe('ok');
    expect(setPayload).toHaveBeenCalledWith('notebook_collections', {
      payload: { deleted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
      filter: { must: [byId] },
    });
    expect(batchDelete).not.toHaveBeenCalled();
  });

  it('refuses a system notebook', async () => {
    scrollDocuments.mockResolvedValueOnce([point({ user_id: 'SYSTEM' })]);

    expect(await new NotebookQdrantHelper().trashNotebookCollection('nb-1')).toBe('forbidden');
    expect(setPayload).not.toHaveBeenCalled();
  });

  it('answers not_found for a notebook that is already trashed', async () => {
    scrollDocuments.mockResolvedValueOnce([]);

    expect(await new NotebookQdrantHelper().trashNotebookCollection('nb-1')).toBe('not_found');
    expect(setPayload).not.toHaveBeenCalled();
  });

  it('restore removes the deleted_at key only', async () => {
    await new NotebookQdrantHelper().restoreNotebookCollection('nb-1');

    expect(deletePayload).toHaveBeenCalledWith('notebook_collections', {
      keys: ['deleted_at'],
      filter: { must: [byId] },
    });
  });
});

describe('purgeNotebookCollection', () => {
  const trashedBefore = (cutoff: Date) => ({
    must: [byId, { key: 'deleted_at', range: { lt: cutoff.toISOString() } }],
  });

  it('deletes the point conditionally, then its links and public tokens', async () => {
    const cutoff = new Date('2026-08-30T00:00:00Z');
    scrollDocuments
      .mockResolvedValueOnce([point({ deleted_at: '2026-08-01T00:00:00.000Z' })])
      .mockResolvedValueOnce([]);

    expect(await new NotebookQdrantHelper().purgeNotebookCollection('nb-1', cutoff)).toBe(true);
    expect(batchDelete.mock.calls[0]).toEqual(['notebook_collections', trashedBefore(cutoff)]);
    expect(effects).toEqual([
      'delete notebook_collections',
      'delete notebook_collection_documents',
      'delete notebook_public_access',
    ]);
  });

  it('touches nothing when the notebook is not trashed (or not before the cutoff)', async () => {
    scrollDocuments.mockResolvedValueOnce([]);

    expect(await new NotebookQdrantHelper().purgeNotebookCollection('nb-1', null)).toBe(false);
    expect(batchDelete).not.toHaveBeenCalled();
  });

  it('keeps the links of a notebook restored between check and delete', async () => {
    scrollDocuments
      .mockResolvedValueOnce([point({ deleted_at: '2026-08-01T00:00:00.000Z' })])
      .mockResolvedValueOnce([point({})]);

    expect(await new NotebookQdrantHelper().purgeNotebookCollection('nb-1', null)).toBe(false);
    expect(effects).toEqual(['delete notebook_collections']);
  });

  it('reports a failing side store and still clears the rest', async () => {
    scrollDocuments
      .mockResolvedValueOnce([point({ deleted_at: '2026-08-01T00:00:00.000Z' })])
      .mockResolvedValueOnce([]);
    batchDelete.mockImplementationOnce((c: string) => {
      effects.push(`delete ${c}`);
      return Promise.resolve({ success: true });
    });
    batchDelete.mockImplementationOnce(() => Promise.reject(new Error('qdrant down')));

    expect(await new NotebookQdrantHelper().purgeNotebookCollection('nb-1', null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', store: 'notebook_collection_documents' })
    );
    expect(effects).toContain('delete notebook_public_access');
  });
});

describe('every notebook_collections reader filters liveOnly (source guard)', () => {
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'NotebookQdrantHelper.ts'),
    'utf8'
  );

  /** Methods that must see trashed points: backfills, the Papierkorb list and the purge. */
  const EXEMPT = new Set([
    'backfillSlugSuffixes',
    'backfillGroupShareModes',
    'backfillAudience',
    'scrollTrashed',
    'purgeNotebookCollection',
  ]);

  /** The argument text of every read call on the notebook_collections collection. */
  function reads(): Array<{ method: string; args: string }> {
    const out: Array<{ method: string; args: string }> = [];
    for (const m of source.matchAll(/qdrantOps!\.(?:client\.)?(\w+)\(/g)) {
      if (!/^(scrollDocuments|vectorSearch|search|scroll|retrieve|count|query)/.test(m[1])) {
        continue;
      }
      let depth = 1;
      let i = m.index + m[0].length;
      while (depth > 0 && i < source.length) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') depth--;
        i++;
      }
      const args = source.slice(m.index + m[0].length, i);
      if (!args.includes('collections.notebook_collections,')) continue;
      const methods = [...source.slice(0, m.index).matchAll(/^ {2}(?:private )?async (\w+)\(/gm)];
      out.push({ method: methods[methods.length - 1]?.[1] ?? '?', args });
    }
    return out;
  }

  it('sees the readers at all', () => {
    expect(reads().length).toBeGreaterThanOrEqual(10);
  });

  it('wraps each non-exempt read in liveOnly(', () => {
    const unfiltered = reads()
      .filter((r) => !EXEMPT.has(r.method) && !r.args.includes('liveOnly('))
      .map((r) => r.method);
    expect(unfiltered).toEqual([]);
  });
});
