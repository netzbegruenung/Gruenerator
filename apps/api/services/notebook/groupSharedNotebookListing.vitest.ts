import { describe, expect, it, vi } from 'vitest';

import { listGroupSharedNotebooksForUser } from './groupSharedNotebookListing.js';

import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';

function collection(over: Partial<NotebookCollection>): NotebookCollection {
  return {
    id: 'n1',
    user_id: 'owner',
    name: 'Notebook',
    description: null,
    share_mode: 'groups',
    ...over,
  } as NotebookCollection;
}

function deps(
  shareRows: Array<{ content_id: string; group_names: string[] }>,
  collections: NotebookCollection[]
) {
  return {
    query: vi.fn(async () => shareRows),
    helper: { getNotebookCollectionsByIds: vi.fn(async () => collections) },
  };
}

describe('listGroupSharedNotebooksForUser', () => {
  it('scopes the share lookup to the viewer and attaches the group names', async () => {
    const d = deps(
      [{ content_id: 'n1', group_names: ['KV Nord', 'OV Mitte'] }],
      [collection({ id: 'n1' })]
    );

    const result = await listGroupSharedNotebooksForUser('viewer', d);

    expect(d.query).toHaveBeenCalledWith(expect.stringContaining('gm.user_id = $1'), ['viewer']);
    expect(d.helper.getNotebookCollectionsByIds).toHaveBeenCalledWith(['n1']);
    expect(result.map((c) => [c.id, c.shared_via_groups])).toEqual([
      ['n1', ['KV Nord', 'OV Mitte']],
    ]);
  });

  it('leaves out the viewer’s own notebooks — they live under „Eigene"', async () => {
    const d = deps(
      [{ content_id: 'own', group_names: ['KV Nord'] }],
      [collection({ id: 'own', user_id: 'viewer' })]
    );
    expect(await listGroupSharedNotebooksForUser('viewer', d)).toEqual([]);
  });

  it('leaves out a share row on a private notebook, which checkNotebookAccess would refuse', async () => {
    const d = deps(
      [
        { content_id: 'private', group_names: ['KV Nord'] },
        { content_id: 'auth', group_names: ['KV Nord'] },
      ],
      [
        collection({ id: 'private', share_mode: 'private' }),
        collection({ id: 'auth', share_mode: 'authenticated' }),
      ]
    );
    expect((await listGroupSharedNotebooksForUser('viewer', d)).map((c) => c.id)).toEqual(['auth']);
  });

  it('skips the Qdrant lookup when the viewer has no group shares', async () => {
    const d = deps([], []);
    expect(await listGroupSharedNotebooksForUser('viewer', d)).toEqual([]);
    expect(d.helper.getNotebookCollectionsByIds).not.toHaveBeenCalled();
  });
});
