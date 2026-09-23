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
  it('schreibt Spalten und Metadaten-Patch in EINER Anweisung', async () => {
    // Zwei Anweisungen hießen: stürzt der Prozess dazwischen, stehen die
    // Metadaten (filePath weg) ohne die Spalten (status) — der Worker holt
    // die Zeile zurück und findet keine Datei mehr.
    const pg = fakePostgres();
    await updateDocumentMetadata(pg as never, 'doc-1', 'u1', {
      status: 'completed',
      vectorCount: 3,
      additionalMetadata: {
        content_preview: 'neu',
        filePath: undefined,
        reindex_origin: undefined,
      },
    });

    expect(pg.query).toHaveBeenCalledTimes(1);
    expect(pg.update).not.toHaveBeenCalled();
    const [sql, params] = pg.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/- \$3::text\[\]\s*\) \|\| \$4::jsonb/);
    expect(sql).toMatch(/status = \$5/);
    expect(sql).toMatch(/vector_count = \$6/);
    expect(params).toEqual([
      'doc-1',
      'u1',
      ['filePath', 'reindex_origin'],
      '{"content_preview":"neu"}',
      'completed',
      3,
    ]);
  });

  it('nur Metadaten: eine Anweisung, keine Spalten', async () => {
    const pg = fakePostgres();
    await updateDocumentMetadata(pg as never, 'doc-1', 'u1', {
      additionalMetadata: { processing_stage: 'chunking' },
    });
    expect(pg.query).toHaveBeenCalledTimes(1);
    expect(pg.update).not.toHaveBeenCalled();
  });

  it('nur Spalten: eine Anweisung ohne metadata', async () => {
    const pg = fakePostgres();
    await updateDocumentMetadata(pg as never, 'doc-1', 'u1', { status: 'failed' });
    const [sql, params] = pg.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('metadata =');
    expect(params).toEqual(['doc-1', 'u1', 'failed']);
  });
});
