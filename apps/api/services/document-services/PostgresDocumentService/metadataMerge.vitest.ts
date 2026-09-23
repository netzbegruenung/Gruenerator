/**
 * `updateDocumentMetadata` führt Metadaten in der Datenbank zusammen, statt
 * einen Schnappschuss zurückzuschreiben — ein langer Ingest-Lauf überschrieb
 * sonst Tags, die in der Zwischenzeit jemand setzte.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'doc-1' }] }) }) }),
  }),
}));

const { updateDocumentMetadata } = await import('./metadataOperations.js');

function fakePostgres() {
  const row = { id: 'doc-1', user_id: 'u1', status: 'completed', metadata: {} };
  return {
    ensureInitialized: vi.fn(async () => {}),
    query: vi.fn(async () => [row]),
    update: vi.fn(async () => ({ changes: 1, data: [row] })),
  };
}

describe('updateDocumentMetadata — atomare Zusammenführung', () => {
  it('schickt nur den Patch und die zu entfernenden Schlüssel, nie den ganzen Stand', async () => {
    const pg = fakePostgres();
    await updateDocumentMetadata(pg as never, 'doc-1', 'u1', {
      status: 'completed',
      additionalMetadata: {
        content_preview: 'neu',
        filePath: undefined,
        reindex_origin: undefined,
      },
    });

    const [sql, params] = pg.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/- \$3::text\[\]\s*\) \|\| \$4::jsonb/);
    expect(params).toEqual([
      'doc-1',
      'u1',
      ['filePath', 'reindex_origin'],
      '{"content_preview":"neu"}',
    ]);
    // Die übrigen Spalten gehen weiter über das normale Update — ohne `metadata`.
    expect(pg.update).toHaveBeenCalledWith(
      'documents',
      { status: 'completed' },
      { id: 'doc-1', user_id: 'u1' }
    );
  });

  it('nur Metadaten: kein leeres Spalten-Update', async () => {
    const pg = fakePostgres();
    await updateDocumentMetadata(pg as never, 'doc-1', 'u1', {
      additionalMetadata: { processing_stage: 'chunking' },
    });
    expect(pg.query).toHaveBeenCalledTimes(1);
    expect(pg.update).not.toHaveBeenCalled();
  });
});
