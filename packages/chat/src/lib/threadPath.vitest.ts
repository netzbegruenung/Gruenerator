import { describe, expect, it } from 'vitest';

import { buildNotebookThreadPath } from './threadPath';

// A notebook thread row links to its notebook page and carries the thread id in
// the query. The earlier targets (`/gruene-…`, `/notebook/…`) went through
// redirects that dropped the query string, so the id never arrived and every
// notebook conversation opened as a blank start page.
describe('buildNotebookThreadPath', () => {
  it('sends a system collection to its notebook page', () => {
    expect(buildNotebookThreadPath('bayern-system', 't1')).toBe('/notebooks/bayern?thread=t1');
  });

  it('sends a user notebook to the same route, keyed by its id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(buildNotebookThreadPath(id, 't1')).toBe(`/notebooks/${id}?thread=t1`);
  });

  // The page slug is `oesterreich`, the collection `oesterreich-gruene-system`.
  // Stripping the suffix therefore yields a path no route defines on its own —
  // NotebookResolver resolves it by looking the collection up.
  it('keeps the collection name when it differs from the page slug', () => {
    expect(buildNotebookThreadPath('oesterreich-gruene-system', 't1')).toBe(
      '/notebooks/oesterreich-gruene?thread=t1'
    );
  });

  it('strips only a trailing -system, not one inside the name', () => {
    expect(buildNotebookThreadPath('system-wandel-system', 't1')).toBe(
      '/notebooks/system-wandel?thread=t1'
    );
  });
});
