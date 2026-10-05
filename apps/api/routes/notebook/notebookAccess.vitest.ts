/**
 * Opening a notebook used to read its Qdrant row twice — once for the access
 * check, once more in the handler — and a third time for a slug URL, whose
 * lookup already returns the full row. `readNotebookWithAccess` hands the row
 * it read back to the caller and skips the read when given one.
 *
 * Run: `pnpm --filter @gruenerator/api exec vitest run routes/notebook/notebookAccess.vitest.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHelper = vi.hoisted(() => ({ getNotebookCollection: vi.fn() }));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return mockHelper;
  },
}));
const mockPg = vi.hoisted(() => ({ query: vi.fn(async (): Promise<unknown[]> => []) }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));

import { checkNotebookAccess, readNotebookWithAccess } from './notebookAccess.js';

const ROW = { id: 'nb-1', user_id: 'owner', name: 'Presseschau', share_mode: 'private' };

beforeEach(() => {
  vi.clearAllMocks();
  mockHelper.getNotebookCollection.mockResolvedValue(ROW);
});

describe('readNotebookWithAccess', () => {
  it('reads the row once and returns it with the access', async () => {
    const { access, collection } = await readNotebookWithAccess('nb-1', 'owner');

    expect(mockHelper.getNotebookCollection).toHaveBeenCalledTimes(1);
    expect(collection).toBe(ROW);
    expect(access).toEqual({ exists: true, isOwner: true, canRead: true, canEdit: true });
  });

  it('does not read again when the caller already holds the row', async () => {
    const { access } = await readNotebookWithAccess('nb-1', 'stranger', ROW as never);

    expect(mockHelper.getNotebookCollection).not.toHaveBeenCalled();
    expect(access.canRead).toBe(false);
  });

  it('reports a missing notebook as not existing, without a row', async () => {
    mockHelper.getNotebookCollection.mockResolvedValue(null);

    const { access, collection } = await readNotebookWithAccess('nb-1', 'owner');

    expect(access.exists).toBe(false);
    expect(collection).toBeNull();
  });
});

describe('checkNotebookAccess', () => {
  it('keeps its answer', async () => {
    mockHelper.getNotebookCollection.mockResolvedValue({ ...ROW, share_mode: 'authenticated' });

    expect(await checkNotebookAccess('nb-1', 'someone')).toEqual({
      exists: true,
      isOwner: false,
      canRead: true,
      canEdit: false,
    });
  });
});
