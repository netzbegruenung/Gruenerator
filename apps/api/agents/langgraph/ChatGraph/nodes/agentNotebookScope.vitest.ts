import { describe, expect, it } from 'vitest';

import { agentNotebookDocIds } from './agentNotebookScope.js';

/**
 * Die Dateien eines Projekts reisen als `defaultNotebookDocumentIds` (stilles
 * Notebook, `projectFiles.ts`). Diese Vorgabe gilt nur, wenn der Turn selbst
 * nichts gewählt hat — ohne Obergrenze je Datei.
 */
describe('agentNotebookDocIds', () => {
  const files = Array.from({ length: 12 }, (_, i) => `file-${i}`);

  it('searches all default documents as one scope', () => {
    expect(agentNotebookDocIds({ defaultNotebookDocumentIds: files })).toEqual(files);
  });

  it('yields to an explicit @datei pick, which then stays the only scope', () => {
    expect(
      agentNotebookDocIds({ documentIds: ['file-3'], defaultNotebookDocumentIds: files })
    ).toEqual([]);
  });

  it('yields to an @notebook mention', () => {
    expect(
      agentNotebookDocIds({ notebookCollectionIds: ['x'], defaultNotebookDocumentIds: files })
    ).toEqual([]);
    expect(
      agentNotebookDocIds({ notebookDocumentIds: ['n1'], defaultNotebookDocumentIds: files })
    ).toEqual([]);
  });

  it('is empty without default documents', () => {
    expect(agentNotebookDocIds({})).toEqual([]);
  });
});
