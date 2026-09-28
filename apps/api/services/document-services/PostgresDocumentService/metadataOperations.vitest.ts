/**
 * Papierkorb lifecycle for uploaded documents (`documents` + Qdrant chunks).
 * Trash and restore touch only the row; the chunks and notebook links stay
 * until the purge, which deletes the row conditionally and only then Qdrant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { effects, deleteDocumentVectors, removeDocumentsFromAllCollections, reportBackgroundError } =
  vi.hoisted(() => {
    const log: string[] = [];
    return {
      effects: log,
      deleteDocumentVectors: vi.fn((id: string, userId: string) => {
        log.push(`vectors ${id} ${userId}`);
        return Promise.resolve();
      }),
      removeDocumentsFromAllCollections: vi.fn((ids: string[]) => {
        log.push(`notebook links ${ids.join(',')}`);
        return Promise.resolve();
      }),
      reportBackgroundError: vi.fn(),
    };
  });

vi.mock('../DocumentSearchService/DocumentSearchService.js', () => ({
  getQdrantDocumentService: () => ({ deleteDocumentVectors }),
}));
vi.mock('../../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    removeDocumentsFromAllCollections = removeDocumentsFromAllCollections;
  },
}));
vi.mock('../../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

const { getTrashedDocument, purgeDocument, restoreDocument, trashDocument, trashDocuments } =
  await import('./metadataOperations.js');

const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/** A PostgresService whose query answers per statement prefix and logs every statement. */
function fakePostgres(answers: Record<string, unknown[]> = {}) {
  const query = vi.fn(async (sql: string) => {
    const s = flat(sql);
    effects.push(s.split(' WHERE ')[0]);
    const hit = Object.entries(answers).find(([prefix]) => s.startsWith(prefix));
    return hit ? hit[1] : [];
  });
  return { ensureInitialized: vi.fn(async () => {}), query };
}

beforeEach(() => {
  effects.length = 0;
  deleteDocumentVectors.mockClear();
  removeDocumentsFromAllCollections.mockClear();
  reportBackgroundError.mockClear();
});

describe('trash', () => {
  it("sets deleted_at on the caller's live rows only and keeps Qdrant", async () => {
    const pg = fakePostgres({ 'UPDATE documents SET deleted_at = now()': [{ id: 'd1' }] });

    expect(await trashDocuments(pg as never, ['d1', 'd2'], 'u1')).toEqual(['d1']);
    const [sql, params] = pg.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(flat(sql)).toBe(
      'UPDATE documents SET deleted_at = now() WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL RETURNING id'
    );
    expect(params).toEqual([['d1', 'd2'], 'u1']);
    expect(deleteDocumentVectors).not.toHaveBeenCalled();
    expect(removeDocumentsFromAllCollections).not.toHaveBeenCalled();
  });

  it('single trash throws "not found" like the old delete, so the route still answers 404', async () => {
    await expect(trashDocument(fakePostgres() as never, 'd1', 'u1')).rejects.toThrow(
      'Document not found or access denied'
    );
  });
});

describe('restore', () => {
  const trashedRow = {
    id: 'd1',
    title: 'Satzung',
    source_type: 'manual',
    deleted_at: new Date('2026-09-20T10:00:00Z'),
  };

  it('clears deleted_at for the owner', async () => {
    const pg = fakePostgres({ 'SELECT id, title': [{ ...trashedRow, user_id: 'u1' }] });

    expect(await restoreDocument(pg as never, 'd1', 'u1')).toEqual({
      status: 'ok',
      row: trashedRow,
    });
    expect(effects).toEqual([
      'SELECT id, title, source_type, deleted_at, user_id FROM documents',
      'UPDATE documents SET deleted_at = NULL',
    ]);
  });

  it('is owner-only, like delete', async () => {
    const pg = fakePostgres({ 'SELECT id, title': [{ ...trashedRow, user_id: 'someone-else' }] });

    expect(await restoreDocument(pg as never, 'd1', 'u1')).toEqual({ status: 'forbidden' });
    expect(effects.some((e) => e.startsWith('UPDATE'))).toBe(false);
  });

  it('does not find a live document', async () => {
    expect(await getTrashedDocument(fakePostgres() as never, 'd1', 'u1')).toEqual({
      status: 'not_found',
    });
  });
});

describe('purgeDocument', () => {
  it('deletes the row conditionally, then its vectors and notebook links', async () => {
    const cutoff = new Date('2026-08-30T00:00:00Z');
    const pg = fakePostgres({ 'DELETE FROM documents': [{ id: 'd1', user_id: 'u1' }] });

    expect(await purgeDocument(pg as never, 'd1', cutoff)).toBe(true);
    const [sql, params] = pg.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).toContain('deleted_at < $2');
    expect(params).toEqual(['d1', cutoff]);
    expect(effects).toEqual(['DELETE FROM documents', 'vectors d1 u1', 'notebook links d1']);
  });

  it('touches no side store when the document was restored meanwhile (0 rows)', async () => {
    expect(await purgeDocument(fakePostgres() as never, 'd1', null)).toBe(false);
    expect(effects).toEqual(['DELETE FROM documents']);
  });

  it('reports a failing side store and still clears the rest', async () => {
    deleteDocumentVectors.mockRejectedValueOnce(new Error('qdrant down'));
    const pg = fakePostgres({ 'DELETE FROM documents': [{ id: 'd1', user_id: 'u1' }] });

    expect(await purgeDocument(pg as never, 'd1', null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', id: 'd1', store: 'document_vectors' })
    );
    expect(removeDocumentsFromAllCollections).toHaveBeenCalledWith(['d1']);
  });
});
