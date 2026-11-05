import { createHash } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { findDuplicateInNotebook, hashFile } = await import('./notebookDuplicateUpload.js');

const file = { hash: 'abc', filename: 'beschluss.pdf', size: 1234 };

describe('findDuplicateInNotebook', () => {
  it('does not query postgres for an empty notebook', async () => {
    const query = vi.fn();
    const result = await findDuplicateInNotebook('nb', file, {
      listDocumentIds: async () => [],
      query,
    });
    expect(result).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('looks only among the notebook documents and returns the first match', async () => {
    const query = vi.fn(async () => [{ id: 'd1', title: 'Beschluss' }]);
    const result = await findDuplicateInNotebook('nb', file, {
      listDocumentIds: async () => ['d1', 'd2'],
      query,
    });
    expect(result).toEqual({ id: 'd1', title: 'Beschluss' });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([['d1', 'd2'], 'abc', 'beschluss.pdf', 1234]);
    // Trashed rows are not a copy; rows without a hash fall back to name + size.
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('file_hash IS NULL AND filename = $3 AND file_size = $4');
  });

  it('returns null when nothing matches', async () => {
    const result = await findDuplicateInNotebook('nb', file, {
      listDocumentIds: async () => ['d1'],
      query: async () => [],
    });
    expect(result).toBeNull();
  });
});

describe('hashFile', () => {
  it('is the SHA-256 of the raw bytes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dup-upload-'));
    const filePath = path.join(dir, 'a.pdf');
    const bytes = Buffer.from('%PDF-1.7 same bytes');
    writeFileSync(filePath, bytes);
    expect(await hashFile(filePath)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
