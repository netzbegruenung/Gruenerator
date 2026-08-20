/**
 * Thread rows know only which collection a notebook conversation ran against,
 * so opening one has to get from a collection id back to the page that owns it.
 * For most notebooks the page slug is the collection id minus `-system`, which
 * is why string surgery survived so long — but not for all of them.
 */
import { describe, expect, it } from 'vitest';

import { getNotebookConfigByCollectionId, getNotebookConfigBySlug } from './notebookPagesConfig';

describe('getNotebookConfigByCollectionId', () => {
  it('finds the page that owns a system collection', () => {
    expect(getNotebookConfigByCollectionId('bayern-system')?.slug).toBe('bayern');
  });

  // The case the old `collectionId.replace('-system','')` link got wrong: it
  // produced `/gruene-oesterreich-gruene`, a route that does not exist.
  it('finds a page whose slug differs from its collection', () => {
    expect(getNotebookConfigByCollectionId('oesterreich-gruene-system')?.slug).toBe('oesterreich');
  });

  it('ignores collections that only appear inside the multi-source page', () => {
    // `gruene-de-system` is one of several collections on the start page, so it
    // has no page of its own to open.
    expect(getNotebookConfigByCollectionId('gruene-de-system')).toBeUndefined();
  });

  it('returns undefined rather than a default for an unknown collection', () => {
    expect(getNotebookConfigByCollectionId('gibtsnicht-system')).toBeUndefined();
  });

  it('resolves the same page a link built from the slug reaches', () => {
    const viaCollection = getNotebookConfigByCollectionId('oesterreich-gruene-system');
    expect(viaCollection).toBe(getNotebookConfigBySlug('oesterreich'));
  });
});
