/**
 * `resolveUserNotebookDocumentIds` is the only gate between a mentioned
 * notebook UUID and chat search — search itself filters by document_id only.
 * It must admit what the notebook page admits (owner, group share) and nothing
 * else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.fn();
const getCollectionDocuments = vi.fn();

vi.mock('../routes/notebook/notebookAccess.js', () => ({
  checkNotebookAccess: (id: string, userId: string) => access(id, userId),
}));

vi.mock('../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getCollectionDocuments = getCollectionDocuments;
  },
}));

const { resolveUserNotebookDocumentIds } = await import('./notebookCollectionMap.js');

const OWN = '11111111-1111-4111-8111-111111111111';
const SHARED = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  access.mockReset();
  getCollectionDocuments.mockReset();
  access.mockImplementation(async (id: string) => ({
    exists: true,
    isOwner: id === OWN,
    canRead: id === OWN || id === SHARED,
    canEdit: id === OWN,
  }));
  getCollectionDocuments.mockImplementation(async (id: string) => [{ document_id: `doc-${id}` }]);
});

describe('resolveUserNotebookDocumentIds', () => {
  it('resolves a notebook shared with the user via a Projekt, not just owned ones', async () => {
    const result = await resolveUserNotebookDocumentIds('viewer', [OWN, SHARED]);

    expect(access).toHaveBeenCalledWith(SHARED, 'viewer');
    expect(result.resolvedUserNotebookIds).toEqual([OWN, SHARED]);
    expect(result.documentIds).toEqual([`doc-${OWN}`, `doc-${SHARED}`]);
  });

  it('drops a notebook the user cannot read without touching its documents', async () => {
    const result = await resolveUserNotebookDocumentIds('viewer', [FOREIGN]);

    expect(result).toEqual({ documentIds: [], resolvedUserNotebookIds: [] });
    expect(getCollectionDocuments).not.toHaveBeenCalled();
  });

  it('ignores system-notebook slugs and never checks access for them', async () => {
    const result = await resolveUserNotebookDocumentIds('viewer', ['hamburg-notebook']);

    expect(result.resolvedUserNotebookIds).toEqual([]);
    expect(access).not.toHaveBeenCalled();
  });
});
