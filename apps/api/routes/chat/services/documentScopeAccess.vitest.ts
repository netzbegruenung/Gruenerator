import { describe, expect, it, vi } from 'vitest';

import { authorizeDocumentScope, type DocumentScopeAccessDeps } from './documentScopeAccess.js';

import type { NotebookAccess } from '../../notebook/notebookAccess.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const OWN = 'a0000000-0000-4000-8000-000000000001';
const OWN_2 = 'a0000000-0000-4000-8000-000000000002';
const OWN_TRASHED = 'a0000000-0000-4000-8000-000000000003';
const FOREIGN = 'b0000000-0000-4000-8000-000000000001';
const FOREIGN_SHARED = 'b0000000-0000-4000-8000-000000000002';
const FOREIGN_IN_CLOSED = 'b0000000-0000-4000-8000-000000000003';
const MISSING = 'c0000000-0000-4000-8000-000000000001';

const SHARED_NB = 'd0000000-0000-4000-8000-000000000001';
const CLOSED_NB = 'd0000000-0000-4000-8000-000000000002';

interface Doc {
  user_id: string;
  deleted: boolean;
}

const DOCS: Record<string, Doc> = {
  [OWN]: { user_id: ME, deleted: false },
  [OWN_2]: { user_id: ME, deleted: false },
  [OWN_TRASHED]: { user_id: ME, deleted: true },
  [FOREIGN]: { user_id: OTHER, deleted: false },
  [FOREIGN_SHARED]: { user_id: OTHER, deleted: false },
  [FOREIGN_IN_CLOSED]: { user_id: OTHER, deleted: false },
};

const LINKS: Record<string, string[]> = {
  [SHARED_NB]: [FOREIGN_SHARED],
  [CLOSED_NB]: [FOREIGN_IN_CLOSED],
};

const READ: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: false };
const NO_READ: NotebookAccess = { exists: true, isOwner: false, canRead: false, canEdit: false };

function makeDeps(overrides: Partial<DocumentScopeAccessDeps['helper']> = {}) {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    const wanted = sql.includes('ANY(') ? (params[0] as string[]) : [params[0] as string];
    return wanted
      .filter((id) => DOCS[id] && !DOCS[id].deleted)
      .map((id) => ({ id, user_id: DOCS[id].user_id, title: 'Titel' }));
  });
  const access = vi.fn(async (notebookId: string) => (notebookId === SHARED_NB ? READ : NO_READ));
  const helper: DocumentScopeAccessDeps['helper'] = {
    getCollectionIdsForDocuments: vi.fn(async (ids: string[]) => {
      const map = new Map<string, string[]>();
      for (const [nb, docs] of Object.entries(LINKS)) {
        for (const d of docs) if (ids.includes(d)) map.set(d, [...(map.get(d) ?? []), nb]);
      }
      return map;
    }),
    isDocumentInCollection: vi.fn(async (nb: string, doc: string) =>
      (LINKS[nb] ?? []).includes(doc)
    ),
    getNotebookCollection: vi.fn(async (nb: string) => ({ id: nb, name: 'Geteilt' })),
    getCollectionDocuments: vi.fn(async () => []),
    ...overrides,
  } as DocumentScopeAccessDeps['helper'];
  const deps: DocumentScopeAccessDeps = {
    db: { query } as unknown as DocumentScopeAccessDeps['db'],
    helper,
    access,
  };
  return { deps, query, access, helper };
}

describe('authorizeDocumentScope', () => {
  it('keeps documents the user owns', async () => {
    const { deps } = makeDeps();
    const result = await authorizeDocumentScope(ME, [OWN], deps);
    expect(result).toEqual({ documentIds: [OWN], documentNotebookIds: {} });
  });

  it('drops a foreign document that is in no readable notebook', async () => {
    const { deps } = makeDeps();
    expect((await authorizeDocumentScope(ME, [FOREIGN], deps)).documentIds).toEqual([]);
    expect((await authorizeDocumentScope(ME, [FOREIGN_IN_CLOSED], deps)).documentIds).toEqual([]);
  });

  it('keeps a foreign document from a notebook shared with the user, without a notebook id in the request', async () => {
    const { deps } = makeDeps();
    const result = await authorizeDocumentScope(ME, [FOREIGN_SHARED], deps);
    expect(result.documentIds).toEqual([FOREIGN_SHARED]);
    expect(result.documentNotebookIds).toEqual({ [FOREIGN_SHARED]: SHARED_NB });
  });

  it('drops trashed, unknown and non-UUID ids', async () => {
    const { deps } = makeDeps();
    const result = await authorizeDocumentScope(
      ME,
      [OWN_TRASHED, MISSING, 'not-a-uuid', "x' OR 1=1 --"],
      deps
    );
    expect(result.documentIds).toEqual([]);
  });

  it('keeps request order and removes duplicates in a mixed list', async () => {
    const { deps } = makeDeps();
    const result = await authorizeDocumentScope(
      ME,
      [FOREIGN, OWN_2, FOREIGN_SHARED, OWN_TRASHED, OWN, OWN_2, FOREIGN_IN_CLOSED],
      deps
    );
    expect(result.documentIds).toEqual([OWN_2, FOREIGN_SHARED, OWN]);
  });

  it('fails closed for non-owned documents when the notebook lookup errors', async () => {
    const { deps } = makeDeps({
      getCollectionIdsForDocuments: vi.fn(async () => {
        throw new Error('qdrant down');
      }),
    });
    const result = await authorizeDocumentScope(ME, [FOREIGN_SHARED, OWN], deps);
    expect(result.documentIds).toEqual([OWN]);
  });

  it('drops everything when the documents lookup errors', async () => {
    const { deps, query } = makeDeps();
    query.mockRejectedValueOnce(new Error('pg down'));
    expect((await authorizeDocumentScope(ME, [OWN], deps)).documentIds).toEqual([]);
  });

  it('checks each notebook once and skips the lookup for an all-owned list', async () => {
    const { deps, access, helper } = makeDeps();
    await authorizeDocumentScope(ME, [OWN, OWN_2], deps);
    expect(helper.getCollectionIdsForDocuments).not.toHaveBeenCalled();

    const shared2 = 'b0000000-0000-4000-8000-000000000004';
    DOCS[shared2] = { user_id: OTHER, deleted: false };
    LINKS[SHARED_NB] = [FOREIGN_SHARED, shared2];
    try {
      const result = await authorizeDocumentScope(ME, [FOREIGN_SHARED, shared2], deps);
      expect(result.documentIds).toEqual([FOREIGN_SHARED, shared2]);
      expect(access).toHaveBeenCalledTimes(1);
    } finally {
      delete DOCS[shared2];
      LINKS[SHARED_NB] = [FOREIGN_SHARED];
    }
  });
});
