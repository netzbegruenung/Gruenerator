/**
 * Reader refs are re-authorized every turn with the reader's own rules — the
 * user side through `resolveReaderSource`, the system side through the
 * reader's collection rule plus the default filter.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  fakeNotebookDeps,
  DENIED,
} from '../../../services/notebook/__fixtures__/fakeNotebookSources.js';
import {
  fakeDoc,
  makeSystemDeps,
} from '../../../services/notebook/__fixtures__/fakeSystemCollection.js';

vi.mock('../agents/notebookSourceTools.js', () => ({ qdrantScrollPage: vi.fn() }));

const { resolveNotebookSources } = await import('./resolveNotebookSources.js');

const DOC = '00000000-0000-4000-8000-000000000001';
const LV = 'landesverbaende_documents';
const HH_A = 'https://gruene-hamburg.de/a';
const BE_A = 'https://gruene.berlin/a';

function userDeps(opts: Parameters<typeof fakeNotebookDeps>[1] = {}) {
  const { deps } = fakeNotebookDeps([{ id: DOC, title: 'Antrag Radweg', text: 'x' }], opts);
  const { scrollPage } = makeSystemDeps([]);
  return { db: deps.db, helper: deps.helper, access: deps.access, scrollPage };
}

function systemDeps() {
  const { scrollPage } = makeSystemDeps([
    ...fakeDoc(LV, HH_A, ['Hamburg Radverkehr.'], { landesverband: 'HH', title: 'Radverkehr' }),
    ...fakeDoc(LV, BE_A, ['Berlin Mieten.'], { landesverband: 'BE', title: 'Mieten' }),
  ]);
  const { deps } = fakeNotebookDeps([]);
  return { db: deps.db, helper: deps.helper, access: deps.access, scrollPage };
}

describe('resolveNotebookSources — user documents', () => {
  it('lets the owner through without a notebook', async () => {
    const [check] = await resolveNotebookSources(
      [{ documentId: DOC, notebookId: null }],
      'owner-1',
      userDeps()
    );
    expect(check?.source).toEqual({
      kind: 'user',
      documentId: DOC,
      notebookId: null,
      ownerUserId: 'owner-1',
      title: 'Antrag Radweg',
    });
  });

  it('lets a reader of the notebook read a collaborator’s document, as its owner', async () => {
    const [check] = await resolveNotebookSources(
      [{ documentId: DOC, notebookId: 'n1' }],
      'member-1',
      userDeps()
    );
    expect(check?.source).toMatchObject({ kind: 'user', ownerUserId: 'owner-1', notebookId: 'n1' });
  });

  it('drops a foreign document without a notebook', async () => {
    const [check] = await resolveNotebookSources(
      [{ documentId: DOC, notebookId: null }],
      'stranger',
      userDeps()
    );
    expect(check?.source).toBeNull();
  });

  it('drops a foreign document whose notebook the viewer cannot read', async () => {
    const [check] = await resolveNotebookSources(
      [{ documentId: DOC, notebookId: 'n1' }],
      'stranger',
      userDeps({ access: DENIED })
    );
    expect(check?.source).toBeNull();
  });
});

describe('resolveNotebookSources — system documents', () => {
  it('accepts a URL of the collection under its default filter, with its title', async () => {
    const [check] = await resolveNotebookSources(
      [{ collectionId: 'hamburg-system', sourceUrl: HH_A }],
      'u1',
      systemDeps()
    );
    expect(check?.source).toEqual({
      kind: 'system',
      collection: {
        key: 'hamburg',
        systemId: 'hamburg-system',
        name: expect.any(String),
        qdrantCollection: LV,
      },
      sourceUrl: HH_A,
      title: 'Radverkehr',
    });
  });

  it('drops a Berlin URL requested through the Hamburg collection (shared Qdrant collection)', async () => {
    const deps = systemDeps();
    const [check] = await resolveNotebookSources(
      [{ collectionId: 'hamburg-system', sourceUrl: BE_A }],
      'u1',
      deps
    );
    expect(check?.source).toBeNull();
    expect(JSON.stringify(deps.scrollPage.mock.calls[0]![1])).toContain('"landesverband"');
  });

  it('drops agent-only and unknown collections without asking Qdrant', async () => {
    const deps = systemDeps();
    const checks = await resolveNotebookSources(
      [
        { collectionId: 'ricarda-lang-tweets-system', sourceUrl: 'https://x.com/1' },
        { collectionId: 'hamburg', sourceUrl: HH_A },
        { collectionId: 'no-such-system', sourceUrl: HH_A },
      ],
      'u1',
      deps
    );
    expect(checks.map((c) => c.source)).toEqual([null, null, null]);
    expect(deps.scrollPage).not.toHaveBeenCalled();
  });

  it('throws when the check itself fails, so the caller keeps the refs', async () => {
    const deps = systemDeps();
    deps.scrollPage.mockRejectedValueOnce(new Error('qdrant down'));
    await expect(
      resolveNotebookSources([{ collectionId: 'hamburg-system', sourceUrl: HH_A }], 'u1', deps)
    ).rejects.toThrow('qdrant down');
  });
});
